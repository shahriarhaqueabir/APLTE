// tools/live-log-runner.mjs
// Writes jobbot workflow progress to .memory/live.log so the dashboard console streams live.
// Usage: node tools/live-log-runner.mjs  (run in background)
import fs from 'node:fs';
import path from 'node:path';
import { gatherData } from './dashboard/data.js';

const LOG = path.join(process.cwd(), '.memory', 'live.log');
const LOCK = path.join(process.cwd(), '.memory', 'live-log-runner.pid');
fs.mkdirSync(path.dirname(LOG), { recursive: true });
if (!fs.existsSync(LOG)) fs.writeFileSync(LOG, '', 'utf8');

// Single-instance guard: two runners appending the same diff produced duplicated lines.
function alreadyRunning() {
  try {
    const pid = Number(fs.readFileSync(LOCK, 'utf8').trim());
    if (!pid || pid === process.pid) return false;
    process.kill(pid, 0); // throws when the process is gone
    return true;
  } catch { return false; }
}
if (alreadyRunning()) {
  console.log('live-log runner already running; exiting');
  process.exit(0);
}
fs.writeFileSync(LOCK, String(process.pid), 'utf8');
function releaseLock() { try { if (fs.readFileSync(LOCK, 'utf8').trim() === String(process.pid)) fs.unlinkSync(LOCK); } catch {} }
process.on('exit', releaseLock);

function append(line) {
  fs.appendFileSync(LOG, line + '\n', 'utf8');
}

append(`[${new Date().toISOString()}] [SYSTEM] live-log runner started; tailing workflow state`);

let prev = null;
function snapshot(d) {
  return JSON.stringify({
    apps: d.applications.map(a => a.folder + ':' + a.stage),
    runs: d.totals.runs,
    applied: d.global.appliedCount,
    health: d.systemHealth.state,
    interventions: d.interventions.length,
  });
}

function diff(prevD, currD) {
  const out = [];
  // application stage changes
  const prevMap = new Map((prevD?.applications || []).map(a => [a.folder, a.stage]));
  for (const a of currD.applications) {
    const p = prevMap.get(a.folder);
    if (p !== a.stage) out.push(`[APP] ${a.company} - ${a.folder}: ${a.stageLabel}`);
  }
  // Persona runs are streamed from .memory/persona-runs.jsonl by the dashboard server.
  // Emitting them here too produced duplicate [RUN] lines in the console.
  // interventions
  if ((currD.interventions?.length || 0) !== (prevD?.interventions?.length || 0)) {
    out.push(`[QUEUE] interventions: ${currD.interventions.length}`);
  }
  // health change
  if (currD.systemHealth.state !== prevD?.systemHealth?.state) {
    out.push(`[HEALTH] ${prevD?.systemHealth?.state || '?'}  ${currD.systemHealth.state}`);
  }
  return out;
}

// initial
try {
  const d0 = gatherData();
  prev = d0;
  append(`[${new Date().toISOString()}] [INIT] apps=${d0.applications.length} complete=${d0.totals.complete} runs=${d0.totals.runs} health=${d0.systemHealth.state}`);
} catch (e) {
  append(`[${new Date().toISOString()}] [ERROR] initial gather failed: ${e.message}`);
}

setInterval(() => {
  try {
    const d = gatherData();
    const lines = diff(prev, d);
    const ts = new Date().toISOString();
    for (const l of lines) append(`[${ts}] ${l}`);
    prev = d;
  } catch (e) {
    append(`[${new Date().toISOString()}] [ERROR] gather failed: ${e.message}`);
  }
}, 2000);

process.on('SIGINT', () => { append(`[${new Date().toISOString()}] [SYSTEM] live-log runner stopped`); process.exit(0); });
console.log('live-log runner started; writing to', LOG);
