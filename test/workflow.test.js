import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultWorkflow, getWorkflow, currentStep, currentStatus, approve, advance, canAdvance, canApprove, complete } from '../src/workflow/machine.js';
import { STEP_ORDER, STATUS } from '../src/workflow/states.js';

test('defaultWorkflow starts at research pending_review', () => {
  const w = defaultWorkflow();
  assert.equal(w.step, 'research');
  assert.equal(w.status, STATUS.PENDING_REVIEW);
});

test('getWorkflow returns default for missing workflow', () => {
  const w = getWorkflow({});
  assert.equal(w.step, 'research');
});

test('approve + advance moves research -> draft', () => {
  const m = { workflow: defaultWorkflow() };
  approve(m, 'research');
  assert.equal(currentStep(m), 'research');
  assert.equal(currentStatus(m), STATUS.APPROVED);
  assert.ok(m.workflow.approvals.research);
  advance(m);
  assert.equal(currentStep(m), 'draft');
  assert.equal(currentStatus(m), STATUS.PENDING_REVIEW);
});

test('cannot approve wrong step', () => {
  const m = { workflow: defaultWorkflow() };
  assert.throws(() => approve(m, 'draft'));
});

test('cannot advance before approval', () => {
  const m = { workflow: defaultWorkflow() };
  assert.throws(() => advance(m));
});

test('full chain research->draft->checks->render->apply', () => {
  const m = { workflow: defaultWorkflow() };
  for (const step of ['research', 'draft', 'checks', 'render']) {
    approve(m, step);
    advance(m);
  }
  assert.equal(currentStep(m), 'apply');
  complete(m);
  assert.equal(currentStatus(m), STATUS.DONE);
});

test('canAdvance false at last step', () => {
  const m = { workflow: defaultWorkflow() };
  for (const step of ['research', 'draft', 'checks', 'render']) { approve(m, step); advance(m); }
  approve(m, 'apply');
  assert.equal(canAdvance(m), false);
});
