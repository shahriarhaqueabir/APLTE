// src/workflow/machine.js
// Pure functions over a manifest's `workflow` state. No I/O.

import { STEP_ORDER, STEP_LABELS, STATUS, stepIndex, isValidStep } from './states.js';

export function defaultWorkflow() {
  return {
    step: 'research',
    status: STATUS.PENDING_REVIEW,
    approvals: { research: null, draft: null, checks: null, render: null },
    updatedAt: new Date().toISOString(),
  };
}

export function getWorkflow(manifest) {
  const w = manifest && manifest.workflow;
  if (!w || !isValidStep(w.step)) return defaultWorkflow();
  return {
    step: w.step,
    status: w.status || STATUS.PENDING_REVIEW,
    approvals: Object.assign({ research: null, draft: null, checks: null, render: null }, w.approvals || {}),
    updatedAt: w.updatedAt || null,
  };
}

export function currentStep(manifest) {
  return getWorkflow(manifest).step;
}

export function currentStatus(manifest) {
  return getWorkflow(manifest).status;
}

// A step can be approved only when it is the current step and pending review.
export function canApprove(manifest, step) {
  const w = getWorkflow(manifest);
  return w.step === step && w.status === STATUS.PENDING_REVIEW;
}

// Approve the current step. Returns the updated manifest (mutates in place + returns).
export function approve(manifest, step, now = new Date().toISOString()) {
  const w = getWorkflow(manifest);
  if (!manifest.workflow) manifest.workflow = defaultWorkflow();
  if (w.step !== step) {
    throw new Error(`Cannot approve '${step}': current step is '${w.step}'.`);
  }
  if (w.status !== STATUS.PENDING_REVIEW) {
    throw new Error(`Cannot approve '${step}': status is '${w.status}', not pending_review.`);
  }
  manifest.workflow.approvals[step] = now;
  manifest.workflow.status = STATUS.APPROVED;
  manifest.workflow.updatedAt = now;
  return manifest;
}

// Advance to the next step once the current one is approved.
export function canAdvance(manifest) {
  const w = getWorkflow(manifest);
  return w.status === STATUS.APPROVED && STEP_ORDER.indexOf(w.step) < STEP_ORDER.length - 1;
}

export function advance(manifest, now = new Date().toISOString()) {
  const w = getWorkflow(manifest);
  if (!manifest.workflow) manifest.workflow = defaultWorkflow();
  if (w.status !== STATUS.APPROVED) {
    throw new Error(`Cannot advance from '${w.step}': status is '${w.status}', not approved.`);
  }
  const idx = STEP_ORDER.indexOf(w.step);
  if (idx >= STEP_ORDER.length - 1) {
    throw new Error(`Cannot advance: '${w.step}' is the last step.`);
  }
  const next = STEP_ORDER[idx + 1];
  manifest.workflow.step = next;
  manifest.workflow.status = STATUS.PENDING_REVIEW;
  manifest.workflow.updatedAt = now;
  return manifest;
}

// Mark the current step done (e.g., apply completed).
export function complete(manifest, now = new Date().toISOString()) {
  if (!manifest.workflow) manifest.workflow = defaultWorkflow();
  manifest.workflow.status = STATUS.DONE;
  manifest.workflow.updatedAt = now;
  return manifest;
}

export { STEP_ORDER, STEP_LABELS, STATUS };
