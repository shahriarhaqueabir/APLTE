// src/util/live-log.js
// Best-effort append to .memory/live.log so the dashboard console shows
// jobbot activity (fill steps, errors, ...) live. Never throws.
import { appendFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.JOBBOT_ROOT ? resolve(process.env.JOBBOT_ROOT) : join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const LOG = join(ROOT, '.memory', 'live.log');

export function appendLiveLog(line) {
  try {
    mkdirSync(dirname(LOG), { recursive: true });
    const ts = new Date().toISOString();
    const text = String(line ?? '').replace(/\r?\n/g, ' ');
    appendFileSync(LOG, `[${ts}] ${text}\n`, 'utf8');
  } catch {
    // best effort: never let logging break the flow
  }
}

export const LIVE_LOG_PATH = LOG;