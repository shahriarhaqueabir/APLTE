// src/orchestration/application.js
// Persistent application context — holds job metadata, document paths,
// page history, and resolved answers across the entire application flow.
// Replaces ad-hoc memory notes with a structured, queryable object.
//
// NOTE: This module is NOT yet wired into the CLI flow (src/cli.js).
// The apply command currently handles one page per invocation inline.
// This module is retained as a reference for future multi-page orchestration
// and will be integrated when the 'apply-all' command is built.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';

/**
 * Create a new application context.
 *
 * @param {object} job - { url, company, role, platform }
 * @param {object} [options]
 * @param {string} [options.resumePath] - path to tailored CV
 * @param {string} [options.coverLetterPath] - path to tailored cover letter
 * @param {string} [options.dataDir] - where to persist state (default: data/)
 * @returns {object} application context
 */
export function createApplication(job, options = {}) {
  const dataDir = options.dataDir || 'data';
  const ctx = {
    version: '1.0',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    job: {
      url: job.url || null,
      company: job.company || null,
      role: job.role || null,
      platform: job.platform || 'linkedin-easy-apply',
      description: job.description || null,
      requirements: job.requirements || [],
      responsibilities: job.responsibilities || [],
    },
    company: {
      name: job.company || null,
      description: options.companyDescription || null,
      relevantInfo: options.companyRelevantInfo || null,
    },
    candidate: {
      verifiedExperience: options.verifiedExperience || [],
      technicalSkills: options.technicalSkills || [],
      achievements: options.achievements || [],
    },
    documents: {
      resume: options.resumePath || null,
      coverLetter: options.coverLetterPath || null,
    },
    preferences: {
      followCompany: false,
      markAsTopChoice: false,
      coverLetter: 'always',
    },
    status: 'started', // started | scanning | reviewing | filling | handover | final-review | submitted | closed
    pages: [],          // array of page records
    currentPage: null,  // current page record being processed
    resolvedAnswers: {}, // question -> { answer, entryId, confidence, source }
    answers: {
      reusable: {},     // answers from the answer bank (profile-derived)
      jobSpecific: {},   // answers tailored to this job (LLM-generated)
    },
    unknowns: [],       // unresolved unknowns (batched)
    timing: {
      applicationStart: new Date().toISOString(),
      pages: [],          // per-page timing records
      categories: {
        dom_snapshot: 0,
        selenium_roundtrip: 0,
        ai_reasoning: 0,
        field_mapping: 0,
        form_filling: 0,
        navigation_wait: 0,
        total: 0,
      },
    },
    history: [],        // action log within this application
  };

  return ctx;
}

/**
 * Start a new page cycle. Creates a page record and sets it as current.
 */
export function startPage(ctx, scanResult) {
  const page = {
    pageNumber: ctx.pages.length + 1,
    startedAt: new Date().toISOString(),
    timing: {
      domSnapshotMs: 0,
      fieldMappingMs: 0,
      formFillingMs: 0,
      navigationWaitMs: 0,
      pageTotalMs: 0,
    },
    title: scanResult.title || null,
    url: scanResult.url || null,
    jobId: scanResult.jobId || null,
    stage: scanResult.stage || null,
    pageIndicator: scanResult.pageIndicator || null,
    fields: scanResult.fields || [],
    buttons: scanResult.buttons || [],
    plan: null,
    unknowns: [],
    filled: [],
    status: 'scanning', // scanning | planned | reviewing | filled | advanced | handover | final
  };
  ctx.currentPage = page;
  ctx.pages.push(page);
  ctx.status = 'scanning';
  ctx.updatedAt = new Date().toISOString();
  logAction(ctx, 'page-start', { pageNumber: page.pageNumber, title: page.title });
  return page;
}

/**
 * Attach a plan to the current page.
 */
export function attachPlan(ctx, plan) {
  if (!ctx.currentPage) throw new Error('No current page. Call startPage first.');
  ctx.currentPage.plan = plan;
  ctx.currentPage.unknowns = (plan.unknowns || []).map((u) => ({
    field: u.field,
    reason: u.reason,
    resolved: false,
    answer: null,
  }));
  ctx.currentPage.status = 'planned';
  ctx.status = 'reviewing';
  ctx.updatedAt = new Date().toISOString();
  logAction(ctx, 'plan-built', {
    pageNumber: ctx.currentPage.pageNumber,
    matched: (plan.fills || []).length,
    unknowns: (plan.unknowns || []).length,
    ambiguities: (plan.ambiguities || []).length,
  });
  return ctx.currentPage;
}

/**
 * Get all unresolved unknowns across the current page as a batch.
 * Returns an array of { field, reason } ready for batch LLM resolution.
 */
export function getUnknownBatch(ctx) {
  if (!ctx.currentPage) return [];
  return (ctx.currentPage.unknowns || [])
    .filter((u) => !u.resolved)
    .map((u) => ({
      key: u.field.key,
      label: u.field.label,
      type: u.field.type,
      options: u.field.options || null,
      required: u.field.required,
    }));
}

/**
 * Resolve a batch of unknowns at once.
 * @param {object} ctx
 * @param {Array<{key, answer, confidence, source}>} resolutions
 */
export function resolveUnknownBatch(ctx, resolutions) {
  if (!ctx.currentPage) throw new Error('No current page.');
  const byKey = {};
  for (const r of (resolutions || [])) byKey[r.key] = r;

  for (const u of ctx.currentPage.unknowns) {
    const r = byKey[u.field.key];
    if (r) {
      u.resolved = true;
      u.answer = r.answer;
      u.confidence = r.confidence || 'medium';
      u.source = r.source || 'llm-batch';
      ctx.resolvedAnswers[u.field.label] = {
        answer: r.answer,
        entryId: r.entryId || null,
        confidence: u.confidence,
        source: u.source,
      };
    }
  }
  ctx.updatedAt = new Date().toISOString();
  logAction(ctx, 'unknowns-resolved', {
    pageNumber: ctx.currentPage.pageNumber,
    resolved: (resolutions || []).length,
    remaining: ctx.currentPage.unknowns.filter((u) => !u.resolved).length,
  });
}

/**
 * Mark the current page as filled.
 */
export function markPageFilled(ctx, filled) {
  if (!ctx.currentPage) throw new Error('No current page.');
  ctx.currentPage.filled = filled || [];
  ctx.currentPage.status = 'filled';
  ctx.status = 'filling';
  ctx.updatedAt = new Date().toISOString();
  logAction(ctx, 'page-filled', {
    pageNumber: ctx.currentPage.pageNumber,
    fieldCount: (filled || []).length,
  });
}

/**
 * Record timing for a page step.
 * @param {object} ctx
 * @param {string} step - 'domSnapshot' | 'fieldMapping' | 'formFilling' | 'navigationWait'
 * @param {number} ms - duration in milliseconds
 */
export function recordPageTiming(ctx, step, ms) {
  if (!ctx.currentPage || !ctx.currentPage.timing) return;
  const key = step + 'Ms';
  if (key in ctx.currentPage.timing) {
    ctx.currentPage.timing[key] += ms;
  }
  ctx.updatedAt = new Date().toISOString();
}

/**
 * Finalize timing for the current page (calculate total).
 */
export function finalizePageTiming(ctx) {
  if (!ctx.currentPage || !ctx.currentPage.timing) return;
  const t = ctx.currentPage.timing;
  t.pageTotalMs = t.domSnapshotMs + t.fieldMappingMs + t.formFillingMs + t.navigationWaitMs;
  // Update application-level categories
  ctx.timing.categories.dom_snapshot += t.domSnapshotMs;
  ctx.timing.categories.field_mapping += t.fieldMappingMs;
  ctx.timing.categories.form_filling += t.formFillingMs;
  ctx.timing.categories.navigation_wait += t.navigationWaitMs;
  ctx.timing.categories.total += t.pageTotalMs;
  ctx.timing.pages.push({ pageNumber: ctx.currentPage.pageNumber, ...t });
  ctx.updatedAt = new Date().toISOString();
}

/**
 * Mark the current page as advanced (Next clicked).
 */
export function markPageAdvanced(ctx) {
  if (!ctx.currentPage) throw new Error('No current page.');
  ctx.currentPage.status = 'advanced';
  ctx.currentPage.advancedAt = new Date().toISOString();
  finalizePageTiming(ctx);
  ctx.status = 'scanning';
  ctx.updatedAt = new Date().toISOString();
  logAction(ctx, 'page-advanced', { pageNumber: ctx.currentPage.pageNumber });
}

/**
 * Mark the current page as a handover point (file upload).
 */
export function markHandover(ctx, details) {
  if (!ctx.currentPage) throw new Error('No current page.');
  ctx.currentPage.status = 'handover';
  ctx.currentPage.handover = details || {};
  ctx.status = 'handover';
  ctx.updatedAt = new Date().toISOString();
  logAction(ctx, 'handover', { pageNumber: ctx.currentPage.pageNumber, ...details });
}

/**
 * Mark the application as submitted (after user confirms + success verified).
 */
export function markSubmitted(ctx, successMessage) {
  // Finalize timing for the last page if not already done
  if (ctx.currentPage && ctx.currentPage.timing && ctx.currentPage.timing.pageTotalMs === 0) {
    finalizePageTiming(ctx);
  }
  ctx.timing.applicationEnd = new Date().toISOString();
  ctx.timing.totalDurationMs = new Date(ctx.timing.applicationEnd) - new Date(ctx.timing.applicationStart);
  ctx.status = 'submitted';
  ctx.submittedAt = new Date().toISOString();
  ctx.successMessage = successMessage || null;
  ctx.updatedAt = new Date().toISOString();
  logAction(ctx, 'submitted', { successMessage: successMessage });
}

/**
 * Mark the application as closed (user abandoned).
 */
export function markClosed(ctx, reason) {
  ctx.status = 'closed';
  ctx.closedAt = new Date().toISOString();
  ctx.closeReason = reason || null;
  ctx.updatedAt = new Date().toISOString();
  logAction(ctx, 'closed', { reason: reason });
}

/**
 * Get a summary of the application for display.
 */
export function summariseApplication(ctx) {
  const lines = [];
  lines.push(`Application: ${ctx.job.company} — ${ctx.job.role}`);
  lines.push(`URL: ${ctx.job.url || '(none)'}`);
  lines.push(`Status: ${ctx.status}`);
  lines.push(`Platform: ${ctx.job.platform}`);
  lines.push(`Resume: ${ctx.documents.resume || '(none)'}`);
  lines.push(`Cover letter: ${ctx.documents.coverLetter || '(none)'}`);
  lines.push(`Pages processed: ${ctx.pages.length}`);
  lines.push(`Resolved answers: ${Object.keys(ctx.resolvedAnswers).length}`);
  lines.push(`Pending unknowns: ${ctx.unknowns.length}`);
  if (ctx.timing && ctx.timing.totalDurationMs) {
    lines.push(`Total time: ${Math.round(ctx.timing.totalDurationMs / 1000 * 10) / 10}s`);
  }
  lines.push('');
  for (const p of ctx.pages) {
    lines.push(`  Page ${p.pageNumber}: ${p.title || '(untitled)'} — ${p.status} (${(p.fields || []).length} fields, ${(p.filled || []).length} filled, ${(p.unknowns || []).length} unknowns)`);
  }
  return lines.join('\n');
}

/**
 * Persist the application context to a JSON file.
 */
export function saveApplication(ctx, filePath) {
  writeFileSync(filePath, JSON.stringify(ctx, null, 2), 'utf8');
}

/**
 * Load an application context from a JSON file.
 */
export function loadApplication(filePath) {
  if (!existsSync(filePath)) return null;
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function logAction(ctx, action, details) {
  ctx.history.push({
    ts: new Date().toISOString(),
    action: action,
    ...details,
  });
}
