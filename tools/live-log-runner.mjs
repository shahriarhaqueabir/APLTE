// tools/live-log-runner.mjs
// Writes jobbot workflow progress to .memory/live.log so the dashboard console streams live.
// Usage: node tools/live-log-runner.mjs  (run in background)
import fs from 'node:fs';
import path from 'node:path';
import { gatherData } from './dashboard/data.js';

const LOG = path.join(process.cwd(), '.memory', 'live.log');
fs.mkdirSync(path.dirname(LOG), { recursive: true });
if (!fs.existsSync(LOG)) fs.writeFileSync(LOG, '', 'utf8');

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
    if (p !== a.stage) out.push(`[APP] ${a.company} — ${a.folder}: ${p || '?'} → ${a.stage} (${a.stageLabel})`);
  }
  // new persona runs
  if ((currD.totals.runs || 0) > (prevD?.totals?.runs || 0)) {
    const newRuns = currD.runs.slice(0, currD.totals.runs - (prevD?.totals?.runs || 0));
    for (const r of newRuns) out.push(`[RUN] ${r.persona || '?'} — ${r.task || ''} — ${r.status || '?'}`);
  }
  // interventions
  if ((currD.interventions?.length || 0) !== (prevD?.interventions?.length || 0)) {
    out.push(`[QUEUE] interventions: ${currD.interventions.length}`);
  }
  // health change
  if (currD.systemHealth.state !== prevD?.systemHealth?.state) {
    out.push(`[HEALTH] ${prevD?.systemHealth?.state || '?'} → ${currD.systemHealth.state}`);
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

// heartbeat so the stream isn't silent
setInterval(() => {
  append(`[${new Date().toISOString()}] [HEARTBEAT] apps=${prev?.applications?.length || 0} runs=${prev?.totals?.runs || 0}`);
}, 30000);

process.on('SIGINT', () => { append(`[${new Date().toISOString()}] [SYSTEM] live-log runner stopped`); process.exit(0); });
console.log('live-log runner started; writing to', LOG);
