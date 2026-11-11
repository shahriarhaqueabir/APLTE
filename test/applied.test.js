import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { appendApplied, readApplied } from '../src/log/applied.js';

function tempDir() {
  return mkdtempSync(join(tmpdir(), 'jobbot-applied-'));
}

test('appendApplied writes a JSON line with timestamp', () => {
  const dir = tempDir();
  const path = join(dir, 'applied.jsonl');
  const row = appendApplied(path, { job: 'Test Job', company: 'TestCo', status: 'submitted' });
  assert.equal(typeof row.ts, 'string');
  assert.ok(row.ts.includes('T'));
  const lines = readFileSync(path, 'utf8').trim().split('\n');
  assert.equal(lines.length, 1);
  const parsed = JSON.parse(lines[0]);
  assert.equal(parsed.job, 'Test Job');
  assert.equal(parsed.company, 'TestCo');
});

test('appendApplied creates parent directory', () => {
  const dir = tempDir();
  const path = join(dir, 'nested', 'deep', 'applied.jsonl');
  appendApplied(path, { job: 'Test' });
  assert.ok(existsSync(path));
});

test('appendApplied returns the row', () => {
  const dir = tempDir();
  const path = join(dir, 'applied.jsonl');
  const row = appendApplied(path, { job: 'Test', company: 'Co' });
  assert.equal(row.job, 'Test');
  assert.equal(row.company, 'Co');
  assert.ok(row.ts);
});

test('appendApplied uses custom now function', () => {
  const dir = tempDir();
  const path = join(dir, 'applied.jsonl');
  const fixedDate = new Date('2026-11-09T10:00:00.000Z');
  const row = appendApplied(path, { job: 'Test' }, () => fixedDate);
  assert.equal(row.ts, '2026-11-09T10:00:00.000Z');
});

test('readApplied returns empty array for missing file', () => {
  const dir = tempDir();
  const path = join(dir, 'nonexistent.jsonl');
  const result = readApplied(path);
  assert.deepEqual(result, []);
});

test('readApplied parses valid JSONL', () => {
  const dir = tempDir();
  const path = join(dir, 'applied.jsonl');
  appendApplied(path, { job: 'Job 1', company: 'Co1' });
  appendApplied(path, { job: 'Job 2', company: 'Co2' });
  const result = readApplied(path);
  assert.equal(result.length, 2);
  assert.equal(result[0].job, 'Job 1');
  assert.equal(result[1].job, 'Job 2');
});

test('readApplied throws on malformed JSON with line number', () => {
  const dir = tempDir();
  const path = join(dir, 'applied.jsonl');
  writeFileSync(path, '{"job":"ok"}\n{bad json}\n', 'utf8');
  assert.throws(
    () => readApplied(path),
    (err) => err.message.includes('line 2')
  );
});

test('readApplied ignores trailing empty lines', () => {
  const dir = tempDir();
  const path = join(dir, 'applied.jsonl');
  writeFileSync(path, '{"job":"ok"}\n\n\n', 'utf8');
  const result = readApplied(path);
  assert.equal(result.length, 1);
  assert.equal(result[0].job, 'ok');
});

test('readApplied ignores leading empty lines', () => {
  const dir = tempDir();
  const path = join(dir, 'applied.jsonl');
  writeFileSync(path, '\n\n{"job":"ok"}\n', 'utf8');
  const result = readApplied(path);
  assert.equal(result.length, 1);
});