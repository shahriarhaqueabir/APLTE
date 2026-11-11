import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import JSZip from 'jszip';
import { renderLetter } from '../src/render/letter.js';

function normalize(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

import { existsSync } from 'node:fs';
function extractPdfText(pdfPath) {
  const binPath = join(process.cwd(), 'bin', 'pdftotext.exe');
  const bin = existsSync(binPath) ? binPath : 'pdftotext';
  return execFileSync(bin, ['-layout', pdfPath, '-'], { encoding: 'utf8' });
}

async function extractDocxText(docxPath) {
  const buf = readFileSync(docxPath);
  const zip = await JSZip.loadAsync(buf);
  const xml = await zip.file('word/document.xml').async('string');
  return xml
    .replace(/<w:br[^>]*\/>/g, '\n')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<[^>]+>/g, '');
}

test('rendered PDF, DOCX and MD contain the same text', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'jobbot-render-'));
  try {
    const md = [
      '# Jane Doe',
      '',
      'contact@example.com',
      '',
      '## Summary',
      '',
      'Experienced engineer with 5 years.',
      '',
      '- Built systems',
      '- Led teams',
      '',
      '**Skills:** Python, Node',
      '',
      '# End',
    ].join('\n');

    const result = await renderLetter(md, dir, { lang: 'en', title: 'Test' });

    const mdText = readFileSync(result.mdPath, 'utf8');
    const pdfText = extractPdfText(result.pdfPath);
    const docxText = await extractDocxText(result.docxPath);

    const mdTokens = normalize(mdText);
    const pdfTokens = normalize(pdfText);
    const docxTokens = normalize(docxText);

    assert.deepEqual(pdfTokens, mdTokens, 'PDF text differs from MD');
    assert.deepEqual(docxTokens, mdTokens, 'DOCX text differs from MD');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('rendered PDF, DOCX and MD contain the same text (CV style)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'jobbot-render-cv-'));
  try {
    const md = [
      '# Jane Doe',
      '',
      'contact@example.com',
      '',
      '## Experience',
      '',
      'Led platform migration reducing MTTR by 30%.',
      '',
      '- Designed APIs',
      '- Mentored engineers',
    ].join('\n');

    const result = await renderLetter(md, dir, { lang: 'en', title: 'CV', styleType: 'cv' });

    const mdText = readFileSync(result.mdPath, 'utf8');
    const pdfText = extractPdfText(result.pdfPath);
    const docxText = await extractDocxText(result.docxPath);

    assert.deepEqual(normalize(pdfText), normalize(mdText), 'PDF text differs from MD');
    assert.deepEqual(normalize(docxText), normalize(mdText), 'DOCX text differs from MD');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});