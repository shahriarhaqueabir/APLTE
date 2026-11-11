// src/plan/build.js
// Builds a fill plan from a scan result + answer bank.
// Pure logic: no DOM, no browser. Testable without Selenium.

import { matchQuestion, resolveOption } from './match.js';
import { pageHash } from '../util/hash.js';

/**
 * Build a plan from scanned fields and an answer bank.
 *
 * @param {object} scanResult - output of extractFields: { title, pageIndicator, fields, buttons }
 * @param {Array<object>} answers - loaded answer bank (validated)
 * @param {object} [options]
 * @param {number} [options.now] - timestamp for createdAt (default Date.now())
 * @returns {object} plan
 */
export function buildPlan(scanResult, answers, options = {}) {
  const now = options.now ?? Date.now();
  const safe = scanResult || {};
  const fields = Array.isArray(safe.fields) ? safe.fields : [];
  const buttons = Array.isArray(safe.buttons) ? safe.buttons : [];

  const fills = [];
  const unknowns = [];
  const ambiguities = [];

  for (const field of fields) {
    const label = field.label || '';
    const match = matchQuestion(label, answers);

    if (match.status === 'unknown') {
      unknowns.push({ field: field, reason: 'no-match' });
      continue;
    }

    if (match.status === 'ambiguous') {
      ambiguities.push({ field: field, candidates: match.candidates });
      continue;
    }

    const entry = match.entry;
    const lang = match.language || 'en';
    const rawAnswer = (entry.answer && (entry.answer[lang] || entry.answer.en)) || '';

    // Compute confidence score (0-100)
    // Base: match quality
    let confidence = match.status === 'matched' ? 90 : 0;
    // Answer entry confidence
    const entryConf = { high: 10, medium: -10, low: -30 }[entry.confidence] || 0;
    confidence = Math.max(0, Math.min(100, confidence + entryConf));
    // Sensitive fields get a small penalty (require more scrutiny)
    if (entry.sensitive) confidence = Math.max(0, confidence - 5);

    // Resolve select/radio options
    let resolvedValue = rawAnswer;
    let resolution = { ok: true, how: 'direct' };

    if ((field.type === 'select' || field.type === 'radio') && Array.isArray(field.options) && field.options.length > 0) {
      const r = resolveOption(rawAnswer, field.options);
      if (r.ok) {
        resolvedValue = r.option.value !== '' ? r.option.value : r.option.label;
        resolution = { ok: true, how: r.how, option: r.option };
        // Boost confidence for exact matches
        const howBoost = { 'value-exact': 10, 'label-exact': 8, 'label-normalized': 5, 'value-normalized': 3, 'numeric-range': 0, 'language-level': 5 }[r.how] || 0;
        confidence = Math.max(0, Math.min(100, confidence + howBoost));
      } else {
        resolution = { ok: false, reason: r.reason, candidates: r.candidates };
        confidence = Math.max(0, confidence - 20);
      }
    }

    // Direct text fields with exact answer get high confidence
    if (field.type === 'text' || field.type === 'tel' || field.type === 'email' || field.type === 'url' || field.type === 'number' || field.type === 'date' || field.type === 'textarea') {
      confidence = Math.max(confidence, 85);
    }

    // Determine automation policy based on confidence
    let automationPolicy = 'fill-and-verify';
    if (confidence >= 100) automationPolicy = 'fill-automatically';
    else if (confidence >= 90) automationPolicy = 'fill-and-verify';
    else if (confidence >= 70) automationPolicy = 'ask-ai';
    else automationPolicy = 'ask-user';

    fills.push({
      field: field,
      entry: entry,
      language: lang,
      rawAnswer: rawAnswer,
      value: resolvedValue,
      resolution: resolution,
      sensitive: Boolean(entry.sensitive),
      confidence: confidence,
      automationPolicy: automationPolicy,
    });
  }

  // Detect advance button from available buttons
  const advanceCandidates = ['Next', 'Continue', 'Continue to next step', 'Review', 'Review application', 'Weiter', 'Fortfahren', 'Überprüfen', 'Ueberpruefen'];
  let advanceButton = null;
  for (const btn of buttons) {
    const normalized = String(btn).trim().toLowerCase();
    if (advanceCandidates.some((c) => c.toLowerCase() === normalized)) {
      advanceButton = btn.trim();
      break;
    }
  }

  // Batch unknowns: all unresolved questions collected for a single resolution pass
  const batchUnknowns = unknowns.map((u) => ({
    key: u.field.key,
    label: u.field.label,
    type: u.field.type,
    options: u.field.options || null,
    required: u.field.required,
    reason: u.reason,
  }));

  const plan = {
    createdAt: now,
    url: safe.url || null,
    domain: safe.domain || null,
    jobId: safe.jobId || null,
    modalId: safe.modalId || null,
    stage: safe.stage || (safe.pageIndicator ? `${safe.pageIndicator.current}/${safe.pageIndicator.total}` : null),
    pageHash: pageHash(fields),
    title: safe.title || null,
    pageIndicator: safe.pageIndicator || null,
    fields: fields,
    fills: fills,
    unknowns: unknowns,
    ambiguities: ambiguities,
    batchUnknowns: batchUnknowns,
    advanceButton: advanceButton,
    buttons: buttons,
  };

  return plan;
}

/**
 * Summarise a plan for human review (dry-run output).
 * @param {object} plan
 * @returns {string}
 */
export function summarisePlan(plan) {
  const lines = [];
  lines.push(`Page: ${plan.title || '(unknown)'} ${plan.pageIndicator ? `(${plan.pageIndicator.current}/${plan.pageIndicator.total})` : ''}`);
  lines.push(`Fields: ${plan.fills.length + plan.unknowns.length + plan.ambiguities.length} total`);
  lines.push(`  Matched: ${plan.fills.length}`);
  lines.push(`  Unknown: ${plan.unknowns.length}`);
  lines.push(`  Ambiguous: ${plan.ambiguities.length}`);
  lines.push('');

  if (plan.fills.length > 0) {
    lines.push('--- Matched fields ---');
    for (const f of plan.fills) {
      const status = f.resolution && f.resolution.ok ? 'OK' : 'UNRESOLVED';
      lines.push(`  [${f.field.key || '?'}] ${f.field.label} => "${f.value}" (${status}, ${f.resolution.how || '?'}, conf=${f.confidence}, ${f.automationPolicy})`);
    }
    lines.push('');
  }

  if (plan.unknowns.length > 0) {
    lines.push('--- Unknown fields (need manual answer) ---');
    for (const u of plan.unknowns) {
      lines.push(`  [${u.field.key || '?'}] ${u.field.label}`);
    }
    lines.push('');
  }

  if (plan.ambiguities.length > 0) {
    lines.push('--- Ambiguous fields (multiple matches) ---');
    for (const a of plan.ambiguities) {
      lines.push(`  [${a.field.key || '?'}] ${a.field.label} -> ${a.candidates.join(', ')}`);
    }
    lines.push('');
  }

  lines.push(`Advance button: ${plan.advanceButton || '(none detected)'}`);
  return lines.join('\n');
}
