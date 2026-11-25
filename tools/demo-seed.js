#!/usr/bin/env node
// tools/demo-seed.js - Generate sample data for demo/showcase mode
// Usage: npm run demo
// Creates realistic sample applications, audit entries, and dashboard data.

import path from 'node:path';
import { mkdirSync, writeFileSync, appendFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const OUT_DIR = path.join(DATA_DIR, 'out', 'easy-apply');

const sampleApps = [
  { folder: 'demo-acme-senior-frontend', company: 'Acme Corp', title: 'Senior Frontend Engineer', url: 'https://www.linkedin.com/jobs/view/1234567890', status: 'applied', score: 0.92, appliedDate: '2026-11-20' },
  { folder: 'demo-globex-fullstack', company: 'Globex Inc', title: 'Full Stack Developer', url: 'https://www.linkedin.com/jobs/view/2345678901', status: 'reviewed', score: 0.85, appliedDate: null },
  { folder: 'demo-initech-devops', company: 'Initech', title: 'DevOps Engineer', url: 'https://www.linkedin.com/jobs/view/3456789012', status: 'drafted', score: 0.78, appliedDate: null },
  { folder: 'demo-umbrella-qa', company: 'Umbrella Ltd', title: 'QA Automation Engineer', url: 'https://www.linkedin.com/jobs/view/4567890123', status: 'researched', score: 0.71, appliedDate: null },
  { folder: 'demo-stark-sre', company: 'Stark Industries', title: 'Site Reliability Engineer', url: 'https://www.linkedin.com/jobs/view/5678901234', status: 'applied', score: 0.88, appliedDate: '2026-11-18' },
];

const sampleCV = 'Ada Lovelace - Senior Frontend Engineer, Berlin.\nReact, TypeScript, Node.js.\n';
const sampleCL = 'Dear Hiring Manager,\n\nI am interested in this role.\n\nBest regards, Ada Lovelace\n';

function ensureDir(d) { mkdirSync(d, { recursive: true }); }
function writeJson(p, d) { ensureDir(dirname(p)); writeFileSync(p, JSON.stringify(d, null, 2), 'utf8'); }
function appendJsonl(p, e) { ensureDir(dirname(p)); appendFileSync(p, JSON.stringify(e) + '\n', 'utf8'); }
// dirname is imported from node:path above

console.log('Seeding demo data...');

for (const app of sampleApps) {
  const appDir = join(OUT_DIR, app.folder);
  ensureDir(appDir); ensureDir(join(appDir, 'cv')); ensureDir(join(appDir, 'cover-letter')); ensureDir(join(appDir, 'research'));
  writeFileSync(join(appDir, 'cv', 'cv.md'), sampleCV, 'utf8');
  writeFileSync(join(appDir, 'cover-letter', 'cover-letter.md'), sampleCL, 'utf8');
  writeFileSync(join(appDir, 'research', 'company-research.md'), '# Research: ' + app.company + '\n\nCompany overview and culture notes.\n', 'utf8');
  writeFileSync(join(appDir, 'research', 'job-description.md'), '# Job: ' + app.title + '\n\nResponsibilities and requirements.\n', 'utf8');
  // Create dummy PDFs for rendered steps
  writeFileSync(join(appDir, 'cv', 'cv.pdf'), '%PDF-1.4 dummy', 'utf8');
  writeFileSync(join(appDir, 'cover-letter', 'cover-letter.pdf'), '%PDF-1.4 dummy', 'utf8');
  writeJson(join(appDir, 'job.json'), { title: app.title, company: app.company, url: app.url, location: 'Berlin, Germany' });
  writeJson(join(appDir, 'status.json'), { status: app.status, score: app.score, appliedDate: app.appliedDate, lastUpdated: new Date().toISOString() });
  writeJson(join(appDir, 'manifest.json'), {
    application: { userReviewed: app.status !== 'researched', status: app.status, score: app.score },
    documents: [
      { type: 'source', name: 'cv.md' },
      { type: 'source', name: 'cover-letter.md' },
      { type: 'cv', name: 'cv.pdf' },
      { type: 'cover_letter', name: 'cover-letter.pdf' },
    ],
    updatedAt: new Date().toISOString(),
  });
  console.log('  Created: ' + app.folder + ' (' + app.status + ')');
}

const appliedPath = join(DATA_DIR, 'applied.jsonl');
if (existsSync(appliedPath)) writeFileSync(appliedPath, '', 'utf8');
for (const app of sampleApps.filter(a => a.status === 'applied')) {
  appendJsonl(appliedPath, { ts: app.appliedDate + 'T10:00:00.000Z', company: app.company, title: app.title, folder: app.folder, status: 'applied', score: app.score });
}

const auditPath = join(DATA_DIR, 'audit.jsonl');
if (existsSync(auditPath)) writeFileSync(auditPath, '', 'utf8');
const auditEntries = [
  { ts: '2026-11-18T09:00:00.000Z', action: 'scan', folder: 'demo-stark-sre', result: 'ok' },
  { ts: '2026-11-18T09:05:00.000Z', action: 'plan', folder: 'demo-stark-sre', result: 'ok', confidence: 0.88 },
  { ts: '2026-11-18T09:10:00.000Z', action: 'review', folder: 'demo-stark-sre', result: 'approved' },
  { ts: '2026-11-18T09:15:00.000Z', action: 'fill', folder: 'demo-stark-sre', result: 'ok', fields: 12 },
  { ts: '2026-11-18T09:20:00.000Z', action: 'advance', folder: 'demo-stark-sre', result: 'ok' },
  { ts: '2026-11-18T09:25:00.000Z', action: 'audit', folder: 'demo-stark-sre', result: 'recorded' },
  { ts: '2026-11-20T10:00:00.000Z', action: 'scan', folder: 'demo-acme-senior-frontend', result: 'ok' },
  { ts: '2026-11-20T10:05:00.000Z', action: 'plan', folder: 'demo-acme-senior-frontend', result: 'ok', confidence: 0.92 },
  { ts: '2026-11-20T10:10:00.000Z', action: 'review', folder: 'demo-acme-senior-frontend', result: 'approved' },
  { ts: '2026-11-20T10:15:00.000Z', action: 'fill', folder: 'demo-acme-senior-frontend', result: 'ok', fields: 14 },
  { ts: '2026-11-20T10:20:00.000Z', action: 'advance', folder: 'demo-acme-senior-frontend', result: 'ok' },
  { ts: '2026-11-20T10:25:00.000Z', action: 'audit', folder: 'demo-acme-senior-frontend', result: 'recorded' },
  { ts: '2026-11-21T14:00:00.000Z', action: 'scan', folder: 'demo-globex-fullstack', result: 'ok' },
  { ts: '2026-11-21T14:05:00.000Z', action: 'plan', folder: 'demo-globex-fullstack', result: 'ok', confidence: 0.85 },
  { ts: '2026-11-21T14:10:00.000Z', action: 'review', folder: 'demo-globex-fullstack', result: 'approved' },
];
for (const entry of auditEntries) { appendJsonl(auditPath, entry); }

const cvLib = join(ROOT, 'cv-library');
ensureDir(cvLib);
writeFileSync(join(cvLib, 'master-cv.md'), sampleCV, 'utf8');

writeJson(join(DATA_DIR, 'scan.json'), { url: 'https://www.linkedin.com/jobs/view/1234567890', title: 'Senior Frontend Engineer', company: 'Acme Corp', fields: [{ name: 'firstName', type: 'text', value: 'Ada' }], scannedAt: new Date().toISOString() });
writeJson(join(DATA_DIR, 'pending-plan.json'), { folder: 'demo-acme-senior-frontend', status: 'reviewed', fields: 14, confidence: 0.92, unknowns: ['salary expectation'], createdAt: new Date().toISOString() });
writeJson(join(DATA_DIR, 'demo-mode.json'), { enabled: true, seededAt: new Date().toISOString(), applications: sampleApps.length });

console.log('\nDemo data seeded: ' + sampleApps.length + ' applications');
console.log('Run: npm run dashboard  (then open http://127.0.0.1:8787)');
console.log('Dashboard will show "Demo Mode" banner.');