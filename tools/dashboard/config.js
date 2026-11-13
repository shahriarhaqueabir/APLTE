// tools/dashboard/config.js
// Central configuration for the dashboard. Single source of truth for paths/ports.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const ROOT = path.join(__dirname, '..', '..');
export const PORT = Number(process.env.DASHBOARD_PORT) || 8787;
export const PATHS = {
  personaRuns: path.join(ROOT, '.memory', 'persona-runs.jsonl'),
  easyApply: path.join(ROOT, 'data', 'out', 'easy-apply'),
  cvLibrary: path.join(ROOT, 'cv-library'),
  scan: path.join(ROOT, 'data', 'scan.json'),
  plan: path.join(ROOT, 'data', 'pending-plan.json'),
  applied: path.join(ROOT, 'data', 'applied.jsonl'),
  audit: path.join(ROOT, 'data', 'audit.jsonl'),
  liveLog: path.join(ROOT, '.memory', 'live.log'),
  reasoningLog: path.join(ROOT, '.memory', 'reasoning.jsonl'),
  memoryDir: path.join(ROOT, '.memory'),
  publicDir: path.join(__dirname, 'public'),
};