import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAudit } from '../src/fill/audit.js';
import { DAILY_CAP, CapError, localDateKey, countApplicationsOn, assertUnderCap } from '../src/fill/cap.js';
import { detectChallenge, assertNoChallenge, ChallengeError } from '../src/scan/challenge.js';

function tempAuditPath() {
  const dir = mkdtempSync(join(tmpdir(), 'jobbot-audit-'));
  return join(dir, 'audit.jsonl');
}

test('audit appends one JSON line per record', () => {
  const path = tempAuditPath();
  const audit = createAudit(path, { now: () => new Date('2026-11-08T10:00:00Z') });
  audit.record({ event: 'fill', field: 'First name', value: 'Ada' });
  audit.record({ event: 'fill', field: 'Last name', value: 'Lovelace' });
  const lines = readFileSync(path, 'utf8').trim().split('\n');
  assert.equal(lines.length, 2);
  assert.equal(JSON.parse(lines[0]).value, 'Ada');
  assert.equal(JSON.parse(lines[1]).ts, '2026-11-08T10:00:00.000Z');
});

test('sensitive values are stored as hashes, never plaintext', () => {
  const path = tempAuditPath();
  const audit = createAudit(path);
  audit.record({ event: 'fill', field: 'Salary', value: '65000 EUR', sensitive: true });
  const raw = readFileSync(path, 'utf8');
  assert.equal(raw.includes('65000 EUR'), false);
  const row = JSON.parse(raw.trim());
  assert.equal(row.value, undefined);
  assert.equal(typeof row.valueHash, 'string');
  assert.equal(row.valueHash.length, 64);
});

test('localDateKey formats as YYYY-MM-DD', () => {
  assert.match(localDateKey(new Date(2026, 10, 8)), /^2026-11-08$/);
});

test('countApplicationsOn only counts applications', () => {
  const entries = [
    { event: 'application', ts: new Date(2026, 10, 8, 9).toISOString() },
    { event: 'fill', ts: new Date(2026, 10, 8, 10).toISOString() },
    { event: 'application', ts: new Date(2026, 10, 7, 9).toISOString() },
  ];
  assert.equal(countApplicationsOn('2026-11-08', entries), 1);
});

test('assertUnderCap passes below the cap', () => {
  const path = tempAuditPath();
  const audit = createAudit(path);
  const now = new Date(2026, 10, 8, 12);
  for (let i = 0; i < 3; i++) audit.record({ event: 'application', ts: now.toISOString() });
  const r = assertUnderCap(path, { now });
  assert.equal(r.used, 3);
  assert.equal(r.remaining, DAILY_CAP - 3);
});

test('assertUnderCap throws at the cap', () => {
  const path = tempAuditPath();
  const audit = createAudit(path);
  const now = new Date(2026, 10, 8, 12);
  for (let i = 0; i < DAILY_CAP; i++) audit.record({ event: 'application', ts: now.toISOString() });
  assert.throws(() => assertUnderCap(path, { now }), CapError);
});

test('assertUnderCap treats a missing audit file as zero applications', () => {
  const r = assertUnderCap(tempAuditPath(), { now: new Date(2026, 10, 8) });
  assert.equal(r.used, 0);
});

test('detectChallenge finds an English security check', () => {
  assert.equal(detectChallenge({ text: "Let's do a quick security check" }).detected, true);
});

test('detectChallenge finds a German security check', () => {
  assert.equal(detectChallenge({ text: 'Ungewöhnliche Aktivität festgestellt' }).detected, true);
});

test('detectChallenge finds a captcha iframe', () => {
  assert.equal(detectChallenge({ text: '', foundSelectors: ['iframe[src*="captcha"]'] }).detected, true);
});

test('detectChallenge leaves a normal page alone', () => {
  const r = detectChallenge({ text: 'Apply to Solutions Consultant at Acme. First name Last name' });
  assert.equal(r.detected, false);
  assert.deepEqual(r.hits, []);
});

test('assertNoChallenge throws on a challenge', () => {
  assert.throws(() => assertNoChallenge({ text: 'verify you are human' }), ChallengeError);
});
