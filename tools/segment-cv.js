#!/usr/bin/env node
// tools/segment-cv.js — segment CVs/MASTER_CV.md into a structured, hash-verified index.
// Output: data/cv-sections.json
//
// Keeps MASTER_CV.md as the single source of truth; this file is a derived index
// that the cross-reference gate (jobbot check-docs) reads instead of the raw markdown.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SRC = join(ROOT, 'CVs', 'MASTER_CV.md');
const OUT = join(ROOT, 'data', 'cv-sections.json');

function sha256(s) { return createHash('sha256').update(String(s), 'utf8').digest('hex'); }

function splitSections(md) {
  const lines = md.split(/\r?\n/);
  const sections = {};
  let current = 'header';
  let buf = [];
  for (const line of lines) {
    const m = line.match(/^##\s+(.+)$/);
    if (m) {
      if (buf.length) sections[current] = buf.join('\n').trim();
      current = m[1].trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
      buf = [line];
    } else {
      buf.push(line);
    }
  }
  if (buf.length) sections[current] = buf.join('\n').trim();
  return sections;
}

function splitExperience(content) {
  // Split "PROFESSIONAL EXPERIENCE" into per-employer blocks by ### headings
  const blocks = {};
  const lines = content.split(/\r?\n/);
  let current = null;
  let buf = [];
  for (const line of lines) {
    const m = line.match(/^###\s+(.+)$/);
    if (m) {
      if (current && buf.length) blocks[current] = buf.join('\n').trim();
      current = m[1].trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
      buf = [line];
    } else if (current) {
      buf.push(line);
    }
  }
  if (current && buf.length) blocks[current] = buf.join('\n').trim();
  return blocks;
}

function splitBullets(content) {
  return content.split(/\r?\n/).map(l => l.trim()).filter(l => /^[-*•]/.test(l)).map(l => l.replace(/^[-*•]\s*/, '').trim());
}

function splitSkills(content) {
  // "**Category:** a, b, c" lines
  const out = {};
  for (const line of content.split(/\r?\n/)) {
    const m = line.match(/^\*\*(.+?):\*\*\s*(.+)$/);
    if (m) {
      const key = m[1].trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
      out[key] = m[2].split(/[,;]/).map(s => s.trim()).filter(Boolean);
    }
  }
  return out;
}

const md = readFileSync(SRC, 'utf8');
const raw = splitSections(md);
const sections = {};

for (const [name, content] of Object.entries(raw)) {
  const entry = { hash: sha256(content), content };
  if (name === 'professional_experience') {
    entry.employers = splitExperience(content);
    for (const [k, v] of Object.entries(entry.employers)) {
      entry.employers[k] = { hash: sha256(v), content: v };
    }
  }
  if (name === 'technical_skills') {
    entry.categories = splitSkills(content);
  }
  if (name === 'core_competencies') {
    entry.items = splitBullets(content);
  }
  if (name === 'certifications' || name === 'languages' || name === 'selected_projects') {
    entry.items = splitBullets(content);
  }
  sections[name] = entry;
}

// Flatten all leaf text for fast substring lookup by the gate
const flatText = md;

const out = {
  source: 'CVs/MASTER_CV.md',
  sourceHash: sha256(md),
  generatedAt: new Date().toISOString(),
  sections,
  flatText,
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(out, null, 2), 'utf8');
console.log(`Segmented ${Object.keys(sections).length} sections -> ${OUT}`);
console.log('Section keys:', Object.keys(sections).join(', '));
