// tools/workflow-status.mjs
// Console view of the jobbot workflow: per-application pipeline steps, status, and timeline.
// Usage: node tools/workflow-status.mjs [--watch] [--interval=2000]
import { gatherData } from './dashboard/data.js';

const args = process.argv.slice(2);
const watch = args.includes('--watch');
const intervalArg = args.find(a => a.startsWith('--interval='));
const interval = intervalArg ? Number(intervalArg.split('=')[1]) : 2000;

const STEP_KEYS = ['research', 'cvSource', 'cvRendered', 'clSource', 'clRendered', 'manifest', 'userReviewed', 'applied'];

function stepMark(v) { return v ? '✓' : '·'; }

function render(data) {
  const lines = [];
  lines.push('═'.repeat(90));
  lines.push(`jobbot workflow status  —  ${new Date(data.generatedAt).toLocaleString()}`);
  lines.push('═'.repeat(90));

  // Global pipeline state
  const g = data.global;
  lines.push(`Global: scan=${g.scan ? 'yes' : 'no'}  plan=${g.plan ? 'yes' : 'no'} (fields=${g.planFields}, unknowns=${g.planUnknowns})  applied=${g.appliedCount}  audit=${g.auditEntries}`);
  lines.push(`Health: ${data.systemHealth.state}  (failed runs=${data.systemHealth.failedExecutions}, interventions=${data.systemHealth.requiresAttention}, hash mismatches=${data.systemHealth.hashMismatchCount})`);
  lines.push('');

  // Per-application pipeline
  lines.push('── Applications ──────────────────────────────────────────────────────────────────────────');
  lines.push('Folder'.padEnd(46) + 'Stage'.padEnd(12) + 'Steps');
  for (const a of data.applications) {
    const steps = STEP_KEYS.map(k => stepMark(a.steps?.[k])).join(' ');
    lines.push(`${a.folder.slice(0, 44).padEnd(46)}${(a.stageLabel || a.stage).padEnd(12)}${steps}`);
    if (a.issues?.length) {
      for (const iss of a.issues) lines.push(`   ↳ ${iss}`);
    }
  }
  lines.push('');
  lines.push('Legend: ' + STEP_KEYS.map((k, i) => `${i + 1}=${k}`).join('  '));
  lines.push('');

  // Recent timeline (top 12)
  lines.push('── Recent activity (newest first) ───────────────────────────────────────────────────────');
  for (const e of (data.timeline || []).slice(0, 12)) {
    const t = new Date(e.time).toLocaleTimeString();
    const status = e.status === 'done' ? '✓' : (e.status === 'failed' ? '✗' : '·');
    lines.push(`${t}  ${status}  ${e.type.padEnd(7)}  ${e.label}${e.detail ? '  — ' + e.detail : ''}`);
  }
  lines.push('');

  // Interventions
  if (data.interventions?.length) {
    lines.push('── Needs attention ──────────────────────────────────────────────────────────────────────');
    for (const iv of data.interventions.slice(0, 15)) {
      lines.push(`  ${iv.company} — ${iv.issue}`);
    }
    lines.push('');
  }

  // CV library
  lines.push(`CV library: ${data.cvLibrary?.length || 0} roles  |  Persona runs: ${data.totals?.runs || 0}  |  Complete apps: ${data.totals?.complete || 0}`);
  lines.push('═'.repeat(90));
  return lines.join('\n');
}

function tick() {
  try {
    const data = gatherData();
    if (watch) process.stdout.write('\x1Bc'); // clear screen
    console.log(render(data));
  } catch (e) {
    console.error('workflow-status error:', e.message);
  }
}

tick();
if (watch) {
  setInterval(tick, interval);
  console.log(`\n(watch mode: refreshing every ${interval}ms — Ctrl+C to stop)`);
}
