import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalize, sha256, pageHash } from '../src/util/hash.js';

test('canonicalize is key-order independent', () => {
  assert.equal(canonicalize({ b: 1, a: 2 }), canonicalize({ a: 2, b: 1 }));
});

test('canonicalize preserves array order', () => {
  assert.notEqual(canonicalize([1, 2]), canonicalize([2, 1]));
});

test('sha256 is stable and 64 hex chars', () => {
  assert.equal(sha256('jobbot').length, 64);
  assert.equal(sha256('jobbot'), sha256('jobbot'));
  assert.match(sha256('jobbot'), /^[0-9a-f]{64}$/);
});

test('pageHash does NOT change when only a field value changes (structure-only)', () => {
  const base = [{ key: 'f0', label: 'First name', type: 'text', required: true, value: '' }];
  const changed = [{ key: 'f0', label: 'First name', type: 'text', required: true, value: 'Ada' }];
  assert.equal(pageHash(base), pageHash(changed));
});

test('pageHash changes when options change', () => {
  const a = [{ key: 'f1', label: 'Country', type: 'select', required: false, options: [{ value: 'DE' }] }];
  const b = [{ key: 'f1', label: 'Country', type: 'select', required: false, options: [{ value: 'AT' }] }];
  assert.notEqual(pageHash(a), pageHash(b));
});

test('pageHash ignores properties not in the projection', () => {
  const a = [{ key: 'f0', label: 'X', type: 'text', required: false, value: '' }];
  const b = [{ key: 'f0', label: 'X', type: 'text', required: false, value: '', selector: 'div:nth-child(2)' }];
  assert.equal(pageHash(a), pageHash(b));
});

test('pageHash is order sensitive', () => {
  const a = [{ key: 'f0', label: 'A', type: 'text', required: false, value: '' }];
  const b = [{ key: 'f1', label: 'B', type: 'text', required: false, value: '' }];
  assert.notEqual(pageHash([...a, ...b]), pageHash([...b, ...a]));
});
