// src/util/browser-events.js
// Best-effort append of structured browser-fill events (JSONL) so the
// dashboard can stream per-field progress live. Never throws; never blocks
// the fill flow. Mirrors appendLiveLog's contract.
import { appendFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.JOBBOT_ROOT ? resolve(process.env.JOBBOT_ROOT) : join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const LOG = join(ROOT, '.memory', 'browser-events.jsonl');

export function appendBrowserEvent(event) {
  try {
    mkdirSync(dirname(LOG), { recursive: true });
    const payload = { ts: new Date().toISOString(), ...(event || {}) };
    appendFileSync(LOG, JSON.stringify(payload) + '\n', 'utf8');
  } catch {
    // best effort: never let logging break the flow
  }
}

export const BROWSER_EVENTS_PATH = LOG;