import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildStatus, formatStatus } from '../src/status.js';
import { appendApplied } from '../src/log/applied.js';
import { createAudit } from '../src/fill/audit.js';

function tempDir() {
  return mkdtempSync(join(tmpdir(), 'jobbot-status-'));
}

test('buildStatus counts today applications from applied.jsonl', () => {
  const dir = tempDir();
  const appliedPath = join(dir, 'applied.jsonl');
  const auditPath = join(dir, 'audit.jsonl');
  const now = new Date(2026, 10, 9, 12, 0, 0);
  appendApplied(appliedPath, { job: 'Job 1', company: 'Co1', status: 'submitted' }, () => now);
  appendApplied(appliedPath, { job: 'Job 2', company: 'Co2', status: 'submitted' }, () => now);
  const status = buildStatus(appliedPath, auditPath, now);
  assert.equal(status.appliedToday, 2);
  assert.equal(status.remaining, 10);
  assert.equal(status.totalApplied, 2);
});

test('buildStatus counts today applications from audit.jsonl', () => {
  const dir = tempDir();
  const appliedPath = join(dir, 'applied.jsonl');
  const auditPath = join(dir, 'audit.jsonl');
  const now = new Date(2026, 10, 9, 12, 0, 0);
  const audit = createAudit(auditPath, { now: () => now });
  audit.record({ event: 'application', ts: now.toISOString() });
  audit.record({ event: 'application', ts: now.toISOString() });
  audit.record({ event: 'fill', ts: now.toISOString() }); // not an application
  const status = buildStatus(appliedPath, auditPath, now);
  assert.equal(status.auditToday, 2);
});

test('buildStatus returns recent (last 5) applications', () => {
  const dir = tempDir();
  const appliedPath = join(dir, 'applied.jsonl');
  const auditPath = join(dir, 'audit.jsonl');
  const now = new Date(2026, 10, 9, 12, 0, 0);
  for (let i = 0; i < 8; i++) {
    appendApplied(appliedPath, { job: `Job ${i}`, company: `Co${i}`, status: 'submitted' }, () => now);
  }
  const status = buildStatus(appliedPath, auditPath, now);
  assert.equal(status.recentApplications.length, 5);
  // Most recent first
  assert.equal(status.recentApplications[0].role, 'Job 7');
});

test('buildStatus returns remaining = cap - used', () => {
  const dir = tempDir();
  const appliedPath = join(dir, 'applied.jsonl');
  const auditPath = join(dir, 'audit.jsonl');
  const now = new Date(2026, 10, 9, 12, 0, 0);
  for (let i = 0; i < 3; i++) {
    appendApplied(appliedPath, { job: `Job ${i}`, status: 'submitted' }, () => now);
  }
  const status = buildStatus(appliedPath, auditPath, now);
  assert.equal(status.remaining, 10);
  assert.equal(status.appliedToday, 3);
});

test('buildStatus handles missing files (0 entries)', () => {
  const dir = tempDir();
  const appliedPath = join(dir, 'nonexistent-applied.jsonl');
  const auditPath = join(dir, 'nonexistent-audit.jsonl');
  const status = buildStatus(appliedPath, auditPath, new Date(2026, 10, 9));
  assert.equal(status.appliedToday, 0);
  assert.equal(status.totalApplied, 0);
  assert.equal(status.auditEntries, 0);
  assert.equal(status.remaining, 10);
});

test('buildStatus filters by date (only today)', () => {
  const dir = tempDir();
  const appliedPath = join(dir, 'applied.jsonl');
  const auditPath = join(dir, 'audit.jsonl');
  const today = new Date(2026, 10, 9, 12, 0, 0);
  const yesterday = new Date(2026, 10, 8, 12, 0, 0);
  appendApplied(appliedPath, { job: 'Today Job', status: 'submitted' }, () => today);
  appendApplied(appliedPath, { job: 'Yesterday Job', status: 'submitted' }, () => yesterday);
  const status = buildStatus(appliedPath, auditPath, today);
  assert.equal(status.appliedToday, 1);
  assert.equal(status.totalApplied, 2);
});

test('formatStatus produces readable text with all fields', () => {
  const status = {
    date: '2026-11-09',
    dailyCap: 10,
    appliedToday: 2,
    auditToday: 2,
    remaining: 8,
    totalApplied: 5,
    recentApplications: [
      { date: '2026-11-09', company: 'TestCo', role: 'Engineer', status: 'submitted', coverLetter: null },
    ],
    auditEntries: 10,
  };
  const text = formatStatus(status);
  assert.ok(text.includes('Date: 2026-11-09'));
  assert.ok(text.includes('2/10 used'));
  assert.ok(text.includes('8 remaining'));
  assert.ok(text.includes('Total applications logged: 5'));
  assert.ok(text.includes('Audit entries: 10'));
  assert.ok(text.includes('TestCo'));
  assert.ok(text.includes('Engineer'));
});

test('formatStatus shows "No applications logged yet." when empty', () => {
  const status = {
    date: '2026-11-09',
    dailyCap: 10,
    appliedToday: 0,
    auditToday: 0,
    remaining: 10,
    totalApplied: 0,
    recentApplications: [],
    auditEntries: 0,
  };
  const text = formatStatus(status);
  assert.ok(text.includes('No applications logged yet.'));
});