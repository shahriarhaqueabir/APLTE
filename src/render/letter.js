// src/render/letter.js
// Renders a document (markdown) to PDF + DOCX.
// PDF: Chrome headless (--headless=new --print-to-pdf --no-pdf-header-footer)
// DOCX: via docx library (maintained, no manual OOXML)

import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { cssForDoc } from './style.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_PATH = join(__dirname, '..', '..', 'templates', 'pdf-template.html');

function loadTemplate() {
  try { return readFileSync(TEMPLATE_PATH, 'utf8'); } catch (e) { return null; }
}

function wrapTemplate(bodyHtml, css, lang, title) {
  const tpl = loadTemplate();
  if (tpl) {
    return tpl
      .replaceAll('{{LANG}}', lang)
      .replaceAll('{{TITLE}}', escapeHtml(title))
      .replaceAll('{{CSS}}', css)
      .replaceAll('{{BODY}}', bodyHtml);
  }
  // Fallback (keeps behavior if template file is missing)
  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>
${css}
section.cv-section { break-inside: auto; }
article.experience { break-inside: avoid; margin-bottom: 0.3em; }
h2 + p, h2 + ul, h2 + article { break-before: avoid; }
h3 + p, h3 + ul { break-before: avoid; }
li { break-inside: avoid; orphans: 2; widows: 2; }
p { orphans: 2; widows: 2; }
@media print {
  body { width: 100%; max-width: none; margin: 0; }
  a { color: inherit; text-decoration: none; }
  section { break-inside: auto; }
  article { break-inside: avoid; }
}
</style>
</head>
<body>
${bodyHtml}
</body>
</html>`;
}

const require2 = createRequire(import.meta.url);
let docxLib;
try { docxLib = require2('docx'); } catch (e) { docxLib = null; }

const CHROME_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
];

function findChrome() {
  const fs = require2('node:fs');
  for (const p of CHROME_CANDIDATES) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error('Chrome not found');
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function inlineFormat(text) {
  // Unescape markdown backslash escapes (\_, \&, \~, etc.) before HTML-escaping.
  const unescaped = String(text).replace(/\\(.)/g, '$1');
  const escaped = escapeHtml(unescaped);
  return escaped.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}

function isContactLine(line) {
  return /@|linkedin\.com|github\.com|vercel\.app|portfolio|\+49|\+\d{2}|Niederlassungserlaubnis|Work authorisation|Languages:/i.test(line);
}

function isCoreCompetency(line) {
  return /^[A-Z][a-zA-Z &\/]+:\s+.+/.test(line) && !line.startsWith('#') && !line.startsWith('-');
}

function buildHtml(mdText, lang, title, styleType) {
  // Strip YAML front matter if present.
  let rawLines = mdText.split(/\r?\n/);
  if (rawLines.length > 0 && rawLines[0].trim() === '---') {
    const endIdx = rawLines.slice(1).findIndex((l) => l.trim() === '---');
    if (endIdx >= 0) rawLines = rawLines.slice(endIdx + 2);
  }
  const lines = rawLines;
  let html = '';
  let inList = false;
  let inPara = false;
  let inSection = false;

  function closePara() { if (inPara) { html += '</p>\n'; inPara = false; } }
  function closeList() { if (inList) { html += '</ul>\n'; inList = false; } }
  function closeSection() { if (inSection) { html += '</section>\n'; inSection = false; } }

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line === '') { closePara(); closeList(); continue; }
    // Skip Markdown thematic breaks (---, ***, ___) — they are layout, not content.
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line)) { closePara(); closeList(); continue; }

    // Heading: # ## ###
    const hMatch = line.match(/^(#{1,3})\s+(.+)$/);
    if (hMatch) {
      closePara(); closeList(); closeSection();
      const level = hMatch[1].length;
      const text = inlineFormat(hMatch[2]);
      if (level === 1) {
        html += `<header class="cv-header"><h1>${text}</h1></header>\n`;
      } else if (level === 2) {
        html += `<section class="cv-section"><h2>${text.toUpperCase()}</h2>\n`;
        inSection = true;
      } else {
        html += `<h3>${text}</h3>\n`;
      }
      continue;
    }

    // Bullet
    const bulletMatch = line.match(/^[-•*]\s+(.+)$/);
    if (bulletMatch) {
      closePara();
      if (!inList) { html += '<ul>\n'; inList = true; }
      html += `<li>${inlineFormat(bulletMatch[1])}</li>\n`;
      continue;
    }

    // Contact line (wrap in .contact class)
    if (isContactLine(line) && !inPara && !inList) {
      closePara(); closeList();
      html += `<p class="contact">${inlineFormat(line)}</p>\n`;
      continue;
    }

    // Core competency (bold label: description, inline)
    if (isCoreCompetency(line) && !inPara && !inList && styleType === 'cv') {
      closePara(); closeList();
      const colonIdx = line.indexOf(':');
      const label = line.slice(0, colonIdx);
      const desc = line.slice(colonIdx + 1).trim();
      html += `<p class="competency"><strong>${inlineFormat(label)}:</strong> ${inlineFormat(desc)}</p>\n`;
      continue;
    }

    // Regular paragraph
    closeList();
    if (!inPara) { html += '<p>'; inPara = true; }
    else { html += ' '; }
    html += inlineFormat(line);
  }
  closePara(); closeList(); closeSection();

  const css = cssForDoc(styleType || 'letter');
  return wrapTemplate(html, css, lang, title);
}

export async function renderLetter(markdownText, outputDir, options = {}) {
  const lang = options.lang || 'en';
  const title = options.title || 'Document';
  const styleType = options.styleType || 'letter';
  const pdfName = options.pdfName || 'document.pdf';
  const docxName = options.docxName || 'document.docx';
  const mdName = options.mdName || 'document.md';
  const htmlName = options.htmlName || 'document.html';

  const outDir = resolve(outputDir);
  mkdirSync(outDir, { recursive: true });

  const mdPath = join(outDir, mdName);
  const htmlPath = join(outDir, htmlName);
  const pdfPath = join(outDir, pdfName);
  const docxPath = join(outDir, docxName);

  writeFileSync(mdPath, markdownText, 'utf8');

  const html = buildHtml(markdownText, lang, title, styleType);
  writeFileSync(htmlPath, html, 'utf8');

  const chromePath = findChrome();
  const profileDir = join(process.env.TEMP || '/tmp', 'jobbot-render-profile');
  mkdirSync(profileDir, { recursive: true });
  const fileUrl = pathToFileURL(htmlPath).href;
  execFileSync(chromePath, [
    '--headless=new',
    '--disable-gpu',
    '--no-pdf-header-footer',
    `--user-data-dir=${profileDir}`,
    `--print-to-pdf=${pdfPath}`,
    fileUrl,
  ], { stdio: 'pipe', timeout: 60000 });

  // Verify step: render PDF pages to PNG (best-effort; requires Poppler's pdftoppm).
  let verifyImages = [];
  const pdftoppmCandidates = ['pdftoppm', join(__dirname, '..', '..', 'bin', 'pdftoppm.exe')];
  for (const cand of pdftoppmCandidates) {
    try {
      const prefix = join(outDir, 'verify-page');
      execFileSync(cand, ['-png', pdfPath, prefix], { stdio: 'pipe', timeout: 120000 });
      const { readdirSync } = await import('node:fs');
      verifyImages = readdirSync(outDir)
        .filter((f) => /^verify-page.*\.png$/i.test(f))
        .map((f) => join(outDir, f))
        .sort();
      break;
    } catch (e) {
      verifyImages = [];
      // try next candidate
    }
  }

  if (docxLib) {
    await renderDocx(markdownText, docxPath, styleType);
  }

  return { mdPath, htmlPath, pdfPath, docxPath, verifyImages };
}

async function renderDocx(markdownText, docxPath, styleType) {
  const { Document, Paragraph, TextRun, Packer } = docxLib;

  const lines = markdownText.split(/\r?\n/);
  const paragraphs = [];
  let current = '';
  for (const line of lines) {
    if (line.trim() === '') {
      if (current.trim()) { paragraphs.push(current.trim()); current = ''; }
    } else {
      current += (current ? ' ' : '') + line.trim().replace(/^#+\s*/, '');
    }
  }
  if (current.trim()) paragraphs.push(current.trim());

  function runsFor(text) {
    const unescaped = String(text).replace(/\\(.)/g, '$1');
    const parts = unescaped.split(/(\*\*[^*]+\*\*)/g);
    return parts.filter(Boolean).map((p) => {
      const bold = p.startsWith('**') && p.endsWith('**');
      const t = bold ? p.slice(2, -2) : p;
      return new TextRun({ text: t, bold: bold, font: 'Calibri', size: 24 });
    });
  }

  const children = paragraphs.map((p) => {
    const isBullet = p.startsWith('• ') || p.startsWith('- ') || p.startsWith('* ');
    const text = isBullet ? p.replace(/^[•\-*]\s*/, '') : p;
    if (isBullet) {
      return new Paragraph({
        children: runsFor(text),
        bullet: { level: 0 },
      });
    }
    return new Paragraph({
      children: runsFor(text),
    });
  });

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: {
            font: 'Calibri',
            size: 24,
          },
        },
      },
    },
    sections: [{ children: children }],
  });

  const buffer = await Packer.toBuffer(doc);
  const { writeFileSync: wf } = await import('node:fs');
  wf(docxPath, buffer);
}