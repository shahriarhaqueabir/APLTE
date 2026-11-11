// src/status.js
// Status reporting: daily cap usage, recent applications, audit summary.

import { readApplied } from './log/applied.js';
import { readAudit, countApplicationsOn, localDateKey, DAILY_CAP } from './fill/cap.js';

/**
 * Build a status report.
 *
 * @param {string} appliedPath - path to applied.jsonl
 * @param {string} auditPath - path to audit.jsonl
 * @param {Date} [now]
 * @returns {object}
 */
export function buildStatus(appliedPath, auditPath, now = new Date()) {
  const applied = readApplied(appliedPath);
  const audit = readAudit(auditPath);

  const today = localDateKey(now);
  const todayApplied = applied.filter((a) => {
    try { return localDateKey(new Date(a.ts)) === today; } catch { return false; }
  });
  const todayAuditCount = countApplicationsOn(today, audit);

  const recent = applied.slice(-5).reverse();

  return {
    date: today,
    dailyCap: DAILY_CAP,
    appliedToday: todayApplied.length,
    auditToday: todayAuditCount,
    remaining: Math.max(0, DAILY_CAP - todayApplied.length),
    totalApplied: applied.length,
    recentApplications: recent.map((a) => ({
      date: (a.ts || '').slice(0, 10),
      company: a.company || '',
      role: a.job || '',
      status: a.status || '',
      coverLetter: a.cover_letter || null,
    })),
    auditEntries: audit.length,
  };
}

/**
 * Format a status report as human-readable text.
 * @param {object} status
 * @returns {string}
 */
export function formatStatus(status) {
  const lines = [];
  lines.push(`Date: ${status.date}`);
  lines.push(`Daily cap: ${status.appliedToday}/${status.dailyCap} used (${status.remaining} remaining)`);
  lines.push(`Total applications logged: ${status.totalApplied}`);
  lines.push(`Audit entries: ${status.auditEntries}`);
  lines.push('');
  if (status.recentApplications.length > 0) {
    lines.push('Recent applications:');
    for (const a of status.recentApplications) {
      lines.push(`  ${a.date}  ${a.company} — ${a.role}  [${a.status}]`);
    }
  } else {
    lines.push('No applications logged yet.');
  }
  return lines.join('\n');
}
