import { readFileSync } from 'node:fs';

export const DAILY_CAP = 10;

export class CapError extends Error {
  constructor(used, cap) {
    super(`Refused: ${used} of ${cap} applications already logged today. Nothing more today.`);
    this.name = 'CapError';
    this.code = 'DAILY_CAP';
    this.used = used;
    this.cap = cap;
  }
}

export function localDateKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function readAudit(path) {
  let raw;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
  return raw
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line, i) => {
      try {
        return JSON.parse(line);
      } catch {
        throw new Error(`audit line ${i + 1} is not valid JSON`);
      }
    });
}

export function countApplicationsOn(dateKey, entries) {
  return entries.filter(
    (e) => e.event === 'application' && localDateKey(new Date(e.ts)) === dateKey,
  ).length;
}

export function assertUnderCap(path, { cap = DAILY_CAP, now = new Date() } = {}) {
  const used = countApplicationsOn(localDateKey(now), readAudit(path));
  if (used >= cap) throw new CapError(used, cap);
  return { used, remaining: cap - used };
}
