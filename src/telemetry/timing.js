// src/telemetry/timing.js
// Timing/telemetry tracker for the application pipeline.
// Tracks per-step and per-page durations for performance analysis.

/**
 * Create a timing tracker.
 * @returns {object} tracker with start/end/duration/summary methods
 */
export function createTimingTracker() {
  const marks = {};

  return {
    /**
     * Start a named timing mark.
     * @param {string} label
     */
    start(label) {
      marks[label] = { start: Date.now(), end: null };
    },

    /**
     * End a named timing mark.
     * @param {string} label
     */
    end(label) {
      if (marks[label] && marks[label].end === null) {
        marks[label].end = Date.now();
      }
    },

    /**
     * Get duration of a mark in milliseconds.
     * @param {string} label
     * @returns {number}
     */
    duration(label) {
      const m = marks[label];
      if (!m) return 0;
      const end = m.end || Date.now();
      return end - m.start;
    },

    /**
     * Get all marks with durations.
     * @returns {object}
     */
    all() {
      const result = {};
      for (const [label, m] of Object.entries(marks)) {
        result[label] = {
          start: m.start,
          end: m.end,
          duration_ms: (m.end || Date.now()) - m.start,
        };
      }
      return result;
    },

    /**
     * Reset all marks.
     */
    reset() {
      for (const key of Object.keys(marks)) delete marks[key];
    },

    /**
     * Build a summary of timings grouped by category.
     * @returns {object}
     */
    summary() {
      const allMarks = this.all();
      const categories = {
        dom_snapshot: 0,
        selenium_roundtrip: 0,
        ai_reasoning: 0,
        field_mapping: 0,
        form_filling: 0,
        navigation_wait: 0,
        total: 0,
      };

      for (const [label, data] of Object.entries(allMarks)) {
        const ms = data.duration_ms;
        if (label.startsWith('dom-snapshot') || label.startsWith('scan')) categories.dom_snapshot += ms;
        else if (label.startsWith('selenium') || label.startsWith('attach') || label.startsWith('open')) categories.selenium_roundtrip += ms;
        else if (label.startsWith('ai-') || label.startsWith('reasoning') || label.startsWith('llm')) categories.ai_reasoning += ms;
        else if (label.startsWith('plan') || label.startsWith('match') || label.startsWith('resolve')) categories.field_mapping += ms;
        else if (label.startsWith('fill') || label.startsWith('apply')) categories.form_filling += ms;
        else if (label.startsWith('nav') || label.startsWith('wait') || label.startsWith('modal')) categories.navigation_wait += ms;
        categories.total += ms;
      }

      return {
        marks: allMarks,
        categories: categories,
        total_ms: categories.total,
        total_seconds: Math.round(categories.total / 1000 * 10) / 10,
      };
    },
  };
}

/**
 * Timing labels used across the pipeline.
 */
export const TIMING_LABELS = {
  BROWSER_LAUNCH: 'browser-launch',
  ATTACH: 'selenium-attach',
  ATTACH_PROOF: 'selenium-attach-proof',
  OPEN_MODAL: 'open-modal',
  MODAL_WAIT: 'modal-wait',
  CHALLENGE_CHECK: 'challenge-check',
  DOM_SNAPSHOT: 'dom-snapshot',
  FIELD_EXTRACTION: 'field-extraction',
  PLAN_BUILD: 'plan-build',
  FIELD_MATCHING: 'field-matching',
  OPTION_RESOLUTION: 'option-resolution',
  AI_REASONING: 'ai-reasoning',
  USER_REVIEW: 'user-review',
  FORM_FILLING: 'form-filling',
  READBACK_VERIFY: 'readback-verify',
  ADVANCE_CLICK: 'advance-click',
  NAVIGATION_WAIT: 'navigation-wait',
  RENDER_PDF: 'render-pdf',
  RENDER_DOCX: 'render-docx',
  PAGE_TOTAL: 'page-total',
  APPLICATION_TOTAL: 'application-total',
};

/**
 * Format a timing summary as human-readable text.
 * @param {object} summary
 * @returns {string}
 */
export function formatTimingSummary(summary) {
  const lines = [];
  lines.push('=== Timing Summary ===');
  lines.push(`Total: ${summary.total_seconds}s (${summary.total_ms}ms)`);
  lines.push('');
  lines.push('By category:');
  for (const [cat, ms] of Object.entries(summary.categories)) {
    if (cat === 'total') continue;
    const pct = summary.total_ms > 0 ? Math.round((ms / summary.total_ms) * 100) : 0;
    lines.push(`  ${cat.padEnd(22)} ${String(ms).padStart(6)}ms  (${pct}%)`);
  }
  lines.push('');
  lines.push('Individual marks:');
  for (const [label, data] of Object.entries(summary.marks)) {
    lines.push(`  ${label.padEnd(24)} ${String(data.duration_ms).padStart(6)}ms`);
  }
  return lines.join('\n');
}