// tools/dashboard/config.js
// Central configuration for the dashboard. Single source of truth for paths/ports.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const ROOT = path.join(__dirname, '..', '..');
export const PORT = Number(process.env.DASHBOARD_PORT) || 8787;
export const PATHS = {
  personaRuns: path.join(process.env.PERSONA_RUNS_DIR || ROOT, '.memory', 'persona-runs.jsonl'),
  easyApply: process.env.EASY_APPLY_DIR || path.join(ROOT, 'data', 'out', 'easy-apply'),
  cvLibrary: process.env.CV_LIBRARY_DIR || path.join(ROOT, 'cv-library'),
  scan: process.env.SCAN_FILE || path.join(ROOT, 'data', 'scan.json'),
  plan: process.env.PLAN_FILE || path.join(ROOT, 'data', 'pending-plan.json'),
  applied: process.env.APPLIED_FILE || path.join(ROOT, 'data', 'applied.jsonl'),
  audit: process.env.AUDIT_FILE || path.join(ROOT, 'data', 'audit.jsonl'),
  liveLog: process.env.LIVE_LOG || path.join(ROOT, '.memory', 'live.log'),
  browserEvents: process.env.BROWSER_EVENTS || path.join(ROOT, '.memory', 'browser-events.jsonl'),
  reasoningLog: process.env.REASONING_LOG || path.join(ROOT, '.memory', 'reasoning.jsonl'),
  memoryDir: process.env.MEMORY_DIR || path.join(ROOT, '.memory'),
  publicDir: path.join(__dirname, 'public'),
};