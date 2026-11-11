// src/workflow/states.js
// Canonical step order and status values for a job application workflow.

export const STEP_ORDER = ['research', 'draft', 'checks', 'render', 'apply'];

export const STEP_LABELS = {
  research: 'Research & Report',
  draft: 'Draft CV/CL',
  checks: 'Automated Checks',
  render: 'Render PDFs',
  apply: 'Apply',
};

export const STATUS = {
  PENDING_REVIEW: 'pending_review',
  APPROVED: 'approved',
  DONE: 'done',
  BLOCKED: 'blocked',
};

export function stepIndex(step) {
  const i = STEP_ORDER.indexOf(step);
  return i === -1 ? -1 : i;
}

export function isValidStep(step) {
  return STEP_ORDER.includes(step);
}
