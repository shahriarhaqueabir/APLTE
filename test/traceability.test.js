import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const PERSONAS_DIR = join(process.cwd(), 'personas');

test('every persona file appends to persona-runs.jsonl (traceability rule)', () => {
  const files = readdirSync(PERSONAS_DIR).filter((f) => f.endsWith('.md') && f !== 'README.md');
  assert.ok(files.length > 0, 'no persona files found');
  for (const f of files) {
    const src = readFileSync(join(PERSONAS_DIR, f), 'utf8');
    assert.match(src, /persona-runs\.jsonl/, `${f}: missing persona-runs.jsonl traceability instruction`);
  }
});

test('every persona file appends a reasoning line to live.log (traceability rule)', () => {
  const files = readdirSync(PERSONAS_DIR).filter((f) => f.endsWith('.md') && f !== 'README.md');
  for (const f of files) {
    const src = readFileSync(join(PERSONAS_DIR, f), 'utf8');
    assert.match(src, /live\.log/, `${f}: missing live.log reasoning instruction`);
    assert.match(src, /\[REASONING\]/, `${f}: missing [REASONING] line instruction`);
  }
});