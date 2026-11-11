import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GuardError,
  PLAN_TTL_MS,
  isTerminalButton,
  isAdvanceAllowed,
  assertFillable,
  assertAdvanceAllowed,
  assertPlanFresh,
  assertPageUnchanged,
} from '../src/fill/guard.js';
import { pageHash } from '../src/util/hash.js';

const fields = [{ key: 'f0', label: 'First name', type: 'text', required: true, value: '' }];

function codeOf(fn) {
  try {
    fn();
  } catch (err) {
    return err instanceof GuardError ? err.code : 'NOT_GUARD_ERROR';
  }
  return 'NO_THROW';
}

test('file inputs are refused', () => {
  assert.equal(codeOf(() => assertFillable({ type: 'file', label: 'Resume' })), 'FILE_INPUT');
});

test('text inputs are allowed', () => {
  assert.equal(codeOf(() => assertFillable({ type: 'text', label: 'Name' })), 'NO_THROW');
});

test('a malformed field is refused', () => {
  assert.equal(codeOf(() => assertFillable(null)), 'BAD_FIELD');
});

test('terminal buttons are detected', () => {
  for (const t of ['Submit application', 'Submit', 'Bewerbung absenden', 'Send application', 'Absenden']) {
    assert.equal(isTerminalButton(t), true, t);
  }
});

test('advance buttons are not terminal', () => {
  for (const t of ['Next', 'Continue', 'Review', 'Weiter', 'Continue to next step']) {
    assert.equal(isTerminalButton(t), false, t);
    assert.equal(isAdvanceAllowed(t), true, t);
  }
});

test('Easy Apply itself is not an advance button', () => {
  assert.equal(isAdvanceAllowed('Easy Apply'), false);
});

test('clicking a submit button throws TERMINAL_BUTTON', () => {
  assert.equal(codeOf(() => assertAdvanceAllowed('Submit application')), 'TERMINAL_BUTTON');
});

test('clicking an unknown button throws NOT_ADVANCE_BUTTON', () => {
  assert.equal(codeOf(() => assertAdvanceAllowed('Save and close')), 'NOT_ADVANCE_BUTTON');
});

test('a fresh plan passes', () => {
  const plan = { createdAt: 1000, pageHash: pageHash(fields) };
  assert.equal(codeOf(() => assertPlanFresh(plan, 1000 + 1000)), 'NO_THROW');
});

test('an expired plan is refused', () => {
  const plan = { createdAt: 1000, pageHash: pageHash(fields) };
  assert.equal(codeOf(() => assertPlanFresh(plan, 1000 + PLAN_TTL_MS + 1)), 'PLAN_EXPIRED');
});

test('a plan without a timestamp is refused', () => {
  assert.equal(codeOf(() => assertPlanFresh({ pageHash: 'x' })), 'PLAN_NO_TIMESTAMP');
});

test('a plan from the future is refused', () => {
  const plan = { createdAt: Date.now() + 60_000, pageHash: 'x' };
  assert.equal(codeOf(() => assertPlanFresh(plan)), 'PLAN_FROM_FUTURE');
});

test('an unchanged page passes', () => {
  const plan = { createdAt: Date.now(), pageHash: pageHash(fields) };
  assert.equal(codeOf(() => assertPageUnchanged(plan, fields)), 'NO_THROW');
});

test('a changed page is refused', () => {
  const plan = { createdAt: Date.now(), pageHash: pageHash(fields) };
  const changed = [{ ...fields[0], label: 'First name (changed)' }];
  assert.equal(codeOf(() => assertPageUnchanged(plan, changed)), 'PAGE_CHANGED');
});
