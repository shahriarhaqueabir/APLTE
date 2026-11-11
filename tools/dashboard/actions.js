// tools/dashboard/actions.js
// Safe, auditable actions triggered from the dashboard.
//
// Rules:
//   - never upload a file and never click Submit
//   - only operate on folders inside data/out/easy-apply
//   - every action is confirmed in the UI and appended to data/audit.jsonl
//
// Real actions:  mark-reviewed, force-rerender
// Simulated:     retry-run, skip-stage (no files change)

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { PATHS, ROOT } from './config.js';

export const ACTIONS = ['mark-reviewed', 'mark-master-cv-reviewed', 'force-rerender', 'retry-run', 'skip-stage', 'mark-applied'];
export const SIMULATED_ONLY = ['retry-run', 'skip-stage'];

const busy = new Set();

function sha256File(p) {
  try { return createHash('sha256').update(fs.readFileSync(p)).digest('hex'); } catch { return null; }
}

function safeAppDir(folder, root = PATHS.easyApply) {
  if (typeof folder !== 'string' || !folder || /[\\/]/.test(folder) || folder === '.' || folder === '..') {
    throw new Error('invalid folder');
  }
  const base = path.resolve(root);
  const dir = path.resolve(base, folder);
  if (!dir.startsWith(base + path.sep)) throw new Error('invalid folder');
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) throw new Error('folder not found');
  return dir;
}

function readManifest(dir) {
  const p = path.join(dir, 'manifest.json');
  if (!fs.existsSync(p)) throw new Error('manifest.json not found');
  return { path: p, manifest: JSON.parse(fs.readFileSync(p, 'utf8')) };
}

function writeManifest(p, manifest) {
  manifest.updatedAt = new Date().toISOString();
  fs.writeFileSync(p, JSON.stringify(manifest, null, 2), 'utf8');
}

function appendAudit(entry, auditPath = PATHS.audit) {
  try {
    fs.mkdirSync(path.dirname(auditPath), { recursive: true });
    fs.appendFileSync(auditPath, JSON.stringify(entry) + '\n', 'utf8');
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

// Group each source markdown with the rendered files that live in the same folder.
function renderGroups(dir, manifest) {
  const docs = manifest.documents || [];
  const groups = [];
  const seen = new Set();

  for (const d of docs) {
    if (d.type !== 'source' || !/\.md$/i.test(d.name || '') || !d.path) continue;
    const groupDir = path.dirname(d.path) === '.' ? '' : path.dirname(d.path);
    if (seen.has(groupDir)) continue;
    seen.add(groupDir);
    const inGroup = (x) => (path.dirname(x.path || '') === '.' ? '' : path.dirname(x.path || '')) === groupDir;
    const pdf = docs.find(x => /\.pdf$/i.test(x.path || '') && inGroup(x) && (x.type === 'cv' || x.type === 'cover-letter'));
    const docx = docs.find(x => /\.docx$/i.test(x.path || '') && inGroup(x) && (x.type === 'cv' || x.type === 'cover-letter'));
    const html = docs.find(x => /\.html$/i.test(x.path || '') && inGroup(x));
    const source = path.join(dir, d.path);
    if (!fs.existsSync(source)) continue;
    groups.push({
      source,
      groupDir,
      mdName: path.basename(d.path),
      pdfName: pdf?.path ? path.basename(pdf.path) : 'document.pdf',
      docxName: docx?.path ? path.basename(docx.path) : 'document.docx',
      htmlName: html?.path ? path.basename(html.path) : 'document.html',
      styleType: /(^|[\\/])cv([\\/]|$)/i.test(groupDir) || /(^|[\\/])cv/i.test(d.path) ? 'cv' : 'letter',
    });
  }

  if (groups.length) return groups;

  // Fallback: any markdown in the app root / cv / cover-letter folders.
  const candidates = ['', 'cv', 'cover-letter'];
  for (const sub of candidates) {
    const abs = sub ? path.join(dir, sub) : dir;
    if (!fs.existsSync(abs)) continue;
    for (const f of fs.readdirSync(abs)) {
      if (!/\.md$/i.test(f)) continue;
      groups.push({
        source: path.join(abs, f),
        groupDir: sub,
        mdName: f,
        pdfName: 'document.pdf',
        docxName: 'document.docx',
        htmlName: 'document.html',
        styleType: sub === 'cv' || /cv/i.test(f) ? 'cv' : 'letter',
      });
    }
  }
  return groups;
}

async function markReviewed(dir) {
  const { path: p, manifest } = readManifest(dir);
  manifest.application = manifest.application || {};
  const already = !!manifest.application.userReviewed;
  manifest.application.userReviewed = true;
  if (!already) writeManifest(p, manifest);
  return { ok: true, note: already ? 'already reviewed' : 'marked reviewed' };
}

async function markMasterCvReviewed(dir) {
  const { path: p, manifest } = readManifest(dir);
  manifest.preparation = manifest.preparation || {};
  const already = manifest.preparation.masterCvReviewed === true;
  manifest.preparation.masterCvReviewed = true;
  if (!already) writeManifest(p, manifest);
  return { ok: true, note: already ? 'already reviewed' : 'master CV marked reviewed' };
}

async function forceRerender(dir) {
  const { path: mp, manifest } = readManifest(dir);
  const groups = renderGroups(dir, manifest);
  if (!groups.length) return { ok: false, error: 'no source markdown to re-render' };
  if (busy.has(dir)) return { ok: false, error: 're-render already running for this folder' };
  busy.add(dir);
  try {
    const { renderLetter } = await import('../../src/render/letter.js');
    const title = `${manifest.job?.company || 'Document'} — ${manifest.job?.role || ''}`.trim();

    for (const g of groups) {
      const markdown = fs.readFileSync(g.source, 'utf8');
      const outputDir = g.groupDir ? path.join(dir, g.groupDir) : dir;
      await renderLetter(markdown, outputDir, {
        lang: 'en',
        title,
        styleType: g.styleType,
        pdfName: g.pdfName,
        docxName: g.docxName,
        mdName: g.mdName,
        htmlName: g.htmlName,
      });
    }

    // Refresh hashes for every manifest document that exists on disk now.
    const now = new Date().toISOString();
    for (const d of (manifest.documents || [])) {
      if (!d.path) continue;
      const full = path.join(dir, d.path);
      if (!fs.existsSync(full)) continue;
      d.hash = sha256File(full);
      d.generatedAt = now;
    }
    writeManifest(mp, manifest);

    // renderLetter writes verify-page PNGs into the output folders; remove them.
    for (const sub of ['', 'cv', 'cover-letter']) {
      const abs = sub ? path.join(dir, sub) : dir;
      if (!fs.existsSync(abs)) continue;
      for (const f of fs.readdirSync(abs)) {
        if (/^verify-page.*\.png$/i.test(f)) {
          try { fs.unlinkSync(path.join(abs, f)); } catch { /* ignore */ }
        }
      }
    }
    return { ok: true, note: `re-rendered ${groups.length} document(s)` };
  } finally {
    busy.delete(dir);
  }
}

async function markApplied(dir) {
  const { path: p, manifest } = readManifest(dir);
  manifest.application = manifest.application || {};
  const already = manifest.application.status === 'applied';
  manifest.application.status = 'applied';
  manifest.application.userReviewed = true;
  if (manifest.workflow) {
    manifest.workflow.step = 'apply';
    manifest.workflow.status = 'done';
    manifest.workflow.updatedAt = new Date().toISOString();
  }
  if (!already) writeManifest(p, manifest);
  return { ok: true, note: already ? 'already applied' : 'marked applied' };
}

async function simulated(action) {
  return { ok: true, note: `${action} simulated (no files changed)` };
}

export async function performAction(action, folders, opts = {}) {
  if (!ACTIONS.includes(action)) throw new Error(`unknown action: ${action}`);
  const list = Array.isArray(folders) ? folders : [];
  if (!list.length) throw new Error('no folders supplied');
  if (list.length > 100) throw new Error('too many folders (max 100)');

  const simulate = !!opts.simulate || SIMULATED_ONLY.includes(action);
  const root = opts.root || PATHS.easyApply;
  const auditPath = opts.auditPath || PATHS.audit;
  const results = [];

  for (const folder of list) {
    try {
      const dir = safeAppDir(folder, root);
      let r;
      if (action === 'mark-applied') r = await markApplied(dir);
      else if (simulate) r = await simulated(action);
      else if (action === 'mark-reviewed') r = await markReviewed(dir);
      else if (action === 'mark-master-cv-reviewed') r = await markMasterCvReviewed(dir);
      else if (action === 'force-rerender') r = await forceRerender(dir);
      else r = await simulated(action);
      results.push({ folder, ...r });
    } catch (e) {
      results.push({ folder, ok: false, error: e.message });
    }
  }

  const audit = appendAudit({
    timestamp: new Date().toISOString(),
    source: 'dashboard',
    action,
    simulate,
    folders: list,
    results,
  }, auditPath);

  return { action, simulate, results, audit };
}

// Resolve a repo-relative path for /file links, refusing escapes.
export function safeRepoPath(rel) {
  const target = path.resolve(ROOT, rel || '');
  if (!target.startsWith(ROOT + path.sep) && target !== ROOT) return null;
  return target;
}
