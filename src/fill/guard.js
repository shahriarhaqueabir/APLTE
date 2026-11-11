import { pageHash } from '../util/hash.js';

export const PLAN_TTL_MS = 5 * 60 * 1000;

export class GuardError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'GuardError';
    this.code = code;
  }
}

const TERMINAL = [
  /\bsubmit\b/i,
  /\bsend application\b/i,
  /^send$/i,
  /application sent/i,
  /bewerbung absenden/i,
  /^absenden$/i,
  /bewerbung senden/i,
  /bewerbung einreichen/i,
  /jetzt bewerben/i,
  /abschicken/i,
  /application einreichen/i,
];

const ADVANCE_ALLOWED = [
  /^next$/i,
  /^continue$/i,
  /^continue to next step$/i,
  /^review$/i,
  /^review application$/i,
  /^weiter$/i,
  /^fortfahren$/i,
  /^ueberpruefen$/i,
  /^überprüfen$/i,
];

export function isTerminalButton(text) {
  const t = String(text ?? '').trim();
  if (t === '') return false;
  return TERMINAL.some((re) => re.test(t));
}

export function isAdvanceAllowed(text) {
  const t = String(text ?? '').trim();
  if (t === '') return false;
  return ADVANCE_ALLOWED.some((re) => re.test(t));
}

export function assertFillable(field) {
  if (!field || typeof field !== 'object') {
    throw new GuardError('BAD_FIELD', 'Refused: field descriptor is missing or malformed.');
  }
  if (field.type === 'file') {
    throw new GuardError(
      'FILE_INPUT',
      `Refused: "${field.label ?? 'unnamed'}" is a file input. Attach it yourself.`,
    );
  }
}

export function assertAdvanceAllowed(text) {
  if (isTerminalButton(text)) {
    throw new GuardError(
      'TERMINAL_BUTTON',
      `Refused: "${text}" sends the application. That click is yours.`,
    );
  }
  if (!isAdvanceAllowed(text)) {
    throw new GuardError(
      'NOT_ADVANCE_BUTTON',
      `Refused: "${text}" is not a recognised Next/Continue/Review button.`,
    );
  }
}

export function assertPlanFresh(plan, now = Date.now()) {
  const createdAt = Number(plan?.createdAt);
  if (!Number.isFinite(createdAt)) {
    throw new GuardError('PLAN_NO_TIMESTAMP', 'Refused: plan has no createdAt.');
  }
  const age = now - createdAt;
  if (age > PLAN_TTL_MS) {
    throw new GuardError(
      'PLAN_EXPIRED',
      `Refused: plan is ${Math.round(age / 1000)}s old, limit is ${PLAN_TTL_MS / 1000}s. Re-scan.`,
    );
  }
  if (age < -5000) {
    throw new GuardError('PLAN_FROM_FUTURE', 'Refused: plan createdAt is in the future.');
  }
}

/**
 * Validate that the page has not changed since the plan was built.
 *
 * Compares: URL, domain, job ID, modal identity, application stage,
 * field identifiers + types, available actions, and the field-value hash.
 *
 * @param {object} plan - must carry plan.snapshot (or at least plan.pageHash + plan.url)
 * @param {object} currentSnapshot - live snapshot from extractFields + page metadata
 * @throws {GuardError} on any mismatch
 */
export function assertPageUnchanged(plan, currentSnapshot) {
  const snapshot = currentSnapshot || {};
  const fields = snapshot.fields || (Array.isArray(currentSnapshot) ? currentSnapshot : []);

  // 1. URL and domain
  if (plan?.url && snapshot.url && plan.url !== snapshot.url) {
    throw new GuardError('URL_CHANGED', `Refused: URL changed from ${plan.url} to ${snapshot.url}. Re-scan.`);
  }
  if (plan?.domain && snapshot.domain && plan.domain !== snapshot.domain) {
    throw new GuardError('DOMAIN_CHANGED', `Refused: domain changed from ${plan.domain} to ${snapshot.domain}. Re-scan.`);
  }

  // 2. Job/application identifier
  if (plan?.jobId && snapshot.jobId && plan.jobId !== snapshot.jobId) {
    throw new GuardError('JOB_CHANGED', `Refused: job ID changed from ${plan.jobId} to ${snapshot.jobId}. Re-scan.`);
  }

  // 3. Modal / page identity
  if (plan?.modalId && snapshot.modalId && plan.modalId !== snapshot.modalId) {
    throw new GuardError('MODAL_CHANGED', `Refused: modal identity changed. Re-scan.`);
  }

  // 4. Application stage (e.g. "1/4 pages", "Contact info")
  if (plan?.stage && snapshot.stage && plan.stage !== snapshot.stage) {
    throw new GuardError('STAGE_CHANGED', `Refused: application stage changed from "${plan.stage}" to "${snapshot.stage}". Re-scan.`);
  }

  // 5. Field identifiers and types
  const planFields = plan?.fields || [];
  if (planFields.length > 0 && fields.length !== planFields.length) {
    throw new GuardError('FIELD_COUNT_CHANGED', `Refused: field count changed (${planFields.length} -> ${fields.length}). Re-scan.`);
  }
  for (let i = 0; i < Math.min(planFields.length, fields.length); i++) {
    if (planFields[i].key !== fields[i].key) {
      throw new GuardError('FIELD_KEY_CHANGED', `Refused: field key changed at index ${i}. Re-scan.`);
    }
    if (planFields[i].type !== fields[i].type) {
      throw new GuardError('FIELD_TYPE_CHANGED', `Refused: field type changed for ${fields[i].key}. Re-scan.`);
    }
    if (planFields[i].label !== fields[i].label) {
      throw new GuardError('FIELD_LABEL_CHANGED', `Refused: field label changed for ${fields[i].key}. Re-scan.`);
    }
  }

  // 6. Available actions
  const planActions = (plan?.buttons || []).slice().sort();
  const liveActions = (snapshot.buttons || []).slice().sort();
  if (planActions.length > 0 && JSON.stringify(planActions) !== JSON.stringify(liveActions)) {
    throw new GuardError('ACTIONS_CHANGED', `Refused: available actions changed. Re-scan.`);
  }

  // 7. Field-value hash (original check)
  const live = pageHash(fields.length > 0 ? fields : (Array.isArray(currentSnapshot) ? currentSnapshot : []));
  if (plan?.pageHash !== undefined && plan.pageHash !== live) {
    throw new GuardError(
      'PAGE_CHANGED',
      'Refused: the page changed since the plan was built. Re-scan and re-approve.',
    );
  }
}
