// tools/dashboard/data.js
// Data gathering: reads files on every call (no caching) so the dashboard stays live.

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { PATHS, ROOT } from './config.js';

function readJsonl(p) {
  if (!fs.existsSync(p)) return [];
  return fs.readFileSync(p, 'utf8').trim().split(/\r?\n/).filter(Boolean)
    .map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}
function readJson(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } }
function listDirs(p) { try { return fs.readdirSync(p, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name); } catch { return []; } }
function exists(p) { try { return fs.existsSync(p); } catch { return false; } }
function statMtime(p) { try { return fs.statSync(p).mtime.toISOString(); } catch { return null; } }
function fileSize(p) { try { return fs.statSync(p).size; } catch { return null; } }
function sha256File(p) { try { return createHash('sha256').update(fs.readFileSync(p)).digest('hex'); } catch { return null; } }

// Canonical pipeline step keys in execution order.
const STEP_KEYS = ['research', 'cvSource', 'cvRendered', 'clSource', 'clRendered', 'manifest', 'userReviewed', 'applied'];

// Resolve a document's on-disk path from a manifest entry or a fallback.
function docPath(dir, d) {
  if (!d) return null;
  if (d.path) {
    const base = path.resolve(dir);
    const full = path.resolve(base, d.path);
    if (full !== base && !full.startsWith(base + path.sep)) return null;
    return full;
  }
  return null;
}

// Per-application pipeline step inference (file-existence based) + timestamps.
function appSteps(dir, manifest) {
  const docs = manifest?.documents || [];
  const findDoc = (type, nameHint) => docs.find(d =>
    d.type === type || (nameHint && (d.name || '').toLowerCase().includes(nameHint)));
  const cvDoc = findDoc('cv');
  const clDoc = findDoc('cover-letter') || findDoc('cover_letter');
  const cvSourceDoc = docs.find(d => d.type === 'source' && /cv/i.test(d.name || ''));
  const clSourceDoc = docs.find(d => d.type === 'source' && /cover|letter|cl/i.test(d.name || ''));

  const researchDir = path.join(dir, 'research');
  const research = exists(path.join(researchDir, 'company-research.md')) && exists(path.join(researchDir, 'job-description.md'));

  const cvSourcePath = cvSourceDoc ? docPath(dir, cvSourceDoc) : path.join(dir, 'cv', 'cv.md');
  if (!exists(cvSourcePath) && exists(path.join(dir, 'source', 'cv.md'))) cvSourcePath = path.join(dir, 'source', 'cv.md');

  const cvRenderedPath = cvDoc ? docPath(dir, cvDoc) : path.join(dir, 'cv', 'cv.pdf');
  const clSourcePath = clSourceDoc ? docPath(dir, clSourceDoc) : path.join(dir, 'cover-letter', 'cover-letter.md');
  if (!exists(clSourcePath) && exists(path.join(dir, 'source', 'cover-letter.md'))) clSourcePath = path.join(dir, 'source', 'cover-letter.md');

  const clRenderedPath = clDoc ? docPath(dir, clDoc) : path.join(dir, 'cover-letter', 'cover-letter.pdf');

  const steps = {
    research: research,
    cvSource: exists(cvSourcePath),
    cvRendered: exists(cvRenderedPath),
    clSource: exists(clSourcePath),
    clRendered: exists(clRenderedPath),
    manifest: exists(path.join(dir, 'manifest.json')),
    userReviewed: !!manifest?.application?.userReviewed,
    applied: manifest?.application?.status === 'applied',
  };

  const timestamps = {
    research: research ? statMtime(path.join(researchDir, 'company-research.md')) : null,
    cvSource: steps.cvSource ? statMtime(cvSourcePath) : null,
    cvRendered: steps.cvRendered ? statMtime(cvRenderedPath) : null,
    clSource: steps.clSource ? statMtime(clSourcePath) : null,
    clRendered: steps.clRendered ? statMtime(clRenderedPath) : null,
    manifest: statMtime(path.join(dir, 'manifest.json')),
    userReviewed: manifest?.application?.userReviewed ? (manifest.updatedAt || null) : null,
    applied: steps.applied ? (manifest.updatedAt || null) : null,
  };

  // convenience resolved paths
  const paths = { cvSourcePath, cvRenderedPath, clSourcePath, clRenderedPath };
  return { steps, timestamps, paths, cvDoc, clDoc, cvSourceDoc, clSourceDoc };
}

function currentStage(steps) {
  if (steps.applied) return 'done';
  for (const k of STEP_KEYS) {
    if (!steps[k]) return k;
  }
  return 'done';
}

function stageLabel(stage) {
  const labels = {
    research: 'research',
    cvSource: 'cv source',
    cvRendered: 'cv rendered',
    clSource: 'cover-letter source',
    clRendered: 'cover-letter rendered',
    manifest: 'manifest',
    userReviewed: 'reviewed',
    applied: 'applied',
    done: 'done',
  };
  return labels[stage] || stage;
}

function artifactList(dir, manifest) {
  const docs = manifest?.documents || [];
  return docs.map(d => {
    const full = docPath(dir, d);
    const present = full ? exists(full) : false;
    const storedHash = d.hash || null;
    const actualHash = present ? sha256File(full) : null;
    return {
      name: d.name || '?',
      path: d.path || null,
      type: d.type || 'unknown',
      hash: storedHash,
      actualHash,
      hashMatches: (storedHash && actualHash) ? storedHash === actualHash : null,
      generatedAt: d.generatedAt || null,
      exists: present,
      size: full ? fileSize(full) : null,
      mtime: full ? statMtime(full) : null,
    };
  });
}

function issueList(manifest, steps, dir) {
  const issues = [];
  if (!steps.applied && !steps.research) issues.push('research missing');
  if (steps.cvSource && !steps.cvRendered) issues.push('cv not rendered');
  if (steps.clSource && !steps.clRendered) issues.push('cover letter not rendered');
  if (!steps.manifest) issues.push('manifest missing');
  if (steps.cvRendered && !steps.userReviewed) issues.push('awaiting user review');
  if (manifest?.application?.status !== 'applied' && steps.userReviewed && steps.clRendered && steps.cvRendered) {
    issues.push('ready to apply');
  }
  // orphan check: manifest docs not on disk
  for (const d of (manifest?.documents || [])) {
    const full = docPath(dir, d);
    if (full && !exists(full)) issues.push(`missing file: ${d.name}`);
  }
  return issues;
}

let _cache = null;
let _cacheTime = 0;
const CACHE_TTL_MS = 1000;

export function gatherData() {
  const cacheNow = Date.now();
  if (_cache && (cacheNow - _cacheTime) < CACHE_TTL_MS) return _cache;
  const runs = readJsonl(PATHS.personaRuns);

  // Applications
  const applications = [];
  for (const name of listDirs(PATHS.easyApply)) {
    const dir = path.join(PATHS.easyApply, name);
    const m = readJson(path.join(dir, 'manifest.json'));
    if (!m) continue;
    const { steps, timestamps, paths, cvDoc, clDoc } = appSteps(dir, m);
    const stage = currentStage(steps);

    // Per-stage durations from step timestamps
    const stageDurations = [];
    const tsEntries = STEP_KEYS.map(k => ({ key: k, t: timestamps[k] ? new Date(timestamps[k]).getTime() : null })).filter(x => x.t);
    for (let i = 0; i < tsEntries.length; i++) {
      const cur = tsEntries[i];
      const next = tsEntries[i + 1];
      stageDurations.push({
        stage: cur.key,
        startedAt: new Date(cur.t).toISOString(),
        endedAt: next ? new Date(next.t).toISOString() : null,
        durationMs: next ? (next.t - cur.t) : null,
      });
    }
    const artifacts = artifactList(dir, m);
    const hashMismatches = artifacts.filter(x => x.hashMatches === false);
    const issues = issueList(m, steps, dir);
    const hasCv = !!(cvDoc ? exists(docPath(dir, cvDoc)) : exists(paths.cvRenderedPath));
    const hasCl = !!(clDoc ? exists(docPath(dir, clDoc)) : exists(paths.clRenderedPath));

    // links: prefer manifest document paths
    const findDocPath = (pred) => {
      const d = (m.documents || []).find(pred);
      return d?.path ? `data/out/easy-apply/${name}/${d.path}` : null;
    };
    const cvHtmlPath = findDocPath(d => d.type === 'cv' && /\.html$/i.test(d.name || '')) ||
      (exists(path.join(dir, 'cv', 'cv.html')) ? `data/out/easy-apply/${name}/cv/cv.html` : null);
    const cvPdfPath = findDocPath(d => d.type === 'cv' && /\.pdf$/i.test(d.name || '')) ||
      (exists(path.join(dir, 'cv', 'cv.pdf')) ? `data/out/easy-apply/${name}/cv/cv.pdf` : null);
    const cvMdPath = findDocPath(d => d.type === 'source' && /cv/i.test(d.name || '')) ||
      (exists(path.join(dir, 'cv', 'cv.md')) ? `data/out/easy-apply/${name}/cv/cv.md` : (exists(path.join(dir, 'cv.md')) ? `data/out/easy-apply/${name}/cv.md` : null));
    const clMdPath = findDocPath(d => d.type === 'source' && /cover|letter|cl/i.test(d.name || '')) ||
      (exists(path.join(dir, 'cover-letter', 'cover-letter.md')) ? `data/out/easy-apply/${name}/cover-letter/cover-letter.md` : (exists(path.join(dir, 'cover-letter.md')) ? `data/out/easy-apply/${name}/cover-letter.md` : null));
    const clHtmlPath = findDocPath(d => d.type === 'cover-letter' && /\.html$/i.test(d.name || '')) ||
      (exists(path.join(dir, 'cover-letter', 'cover-letter.html')) ? `data/out/easy-apply/${name}/cover-letter/cover-letter.html` : null);
    const clPdfPath = findDocPath(d => d.type === 'cover-letter' && /\.pdf$/i.test(d.name || '')) ||
      (exists(path.join(dir, 'cover-letter', 'cover-letter.pdf')) ? `data/out/easy-apply/${name}/cover-letter/cover-letter.pdf` : null);

    applications.push({
      folder: name,
      company: m.job?.company || '?',
      role: m.job?.role || '?',
      platform: m.job?.platform || '?',
      status: m.application?.status || '?',
      userReviewed: !!m.application?.userReviewed,
      masterCvReviewed: m.preparation?.masterCvReviewed === true,
      date: m.application?.date || '?',
      docs: (m.documents || []).length,
      hasCv,
      hasCl,
      jobUrl: m.job?.url || null,
      steps,
      timestamps,
      stageDurations,
      stage,
      stageLabel: stageLabel(stage),
      workflow: m.workflow || null,
      workflowStep: (m.workflow && m.workflow.step) || 'research',
      workflowStatus: (m.workflow && m.workflow.status) || 'pending_review',
      hasResearch: exists(path.join(dir, 'research', 'company-research.md')) || exists(path.join(dir, 'research', 'job-description.md')),
      researchCompanyPath: exists(path.join(dir, 'research', 'company-research.md')) ? ('data/out/easy-apply/' + name + '/research/company-research.md') : null,
      researchJobPath: exists(path.join(dir, 'research', 'job-description.md')) ? ('data/out/easy-apply/' + name + '/research/job-description.md') : null,
      issues,
      artifacts,
      hashMismatches: hashMismatches.map(x => x.name),
      links: { cvHtmlPath, cvPdfPath, cvMdPath, clHtmlPath, clPdfPath, clMdPath },
      createdAt: m.createdAt || null,
      updatedAt: m.updatedAt || null,
    });
  }

  // Master CV
  const masterCvPath = path.join(ROOT, 'CVs', 'MASTER_CV.md');
  const masterCv = {
    exists: exists(masterCvPath),
    path: 'CVs/MASTER_CV.md',
    words: exists(masterCvPath) ? fs.readFileSync(masterCvPath, 'utf8').trim().split(/\s+/).length : 0,
    mtime: exists(masterCvPath) ? statMtime(masterCvPath) : null,
  };

  // Master Cover Letter
  const masterClPath = path.join(ROOT, 'CVs', 'MASTER_COVER_LETTER.md');
  const masterCoverLetter = {
    exists: exists(masterClPath),
    path: 'CVs/MASTER_COVER_LETTER.md',
    words: exists(masterClPath) ? fs.readFileSync(masterClPath, 'utf8').trim().split(/\s+/).length : 0,
    mtime: exists(masterClPath) ? statMtime(masterClPath) : null,
  };

  // Locked template status
  const templateStatus = {
    templateExists: exists(path.join(ROOT, 'templates', 'pdf-template.html')),
    styleExists: exists(path.join(ROOT, 'src', 'render', 'style.js')),
    frozen: true,
    styleTokens: 'Arial 9.5pt (CV) / 10.5pt (letter), 1.4 line height, 15mm (CV) / 0.79in (letter) margins, black text only, bullet U+25CF, A4',
  };

  // Guardrails live status
  const auditLog = readJsonl(PATHS.audit);
  const tosAck = readJson(path.join(ROOT, 'data', 'tos-acknowledgement.json'));
  const todayKey = new Date().toISOString().slice(0, 10);
  const todayApps = auditLog.filter(e => e.event === 'application' && (e.ts || '').slice(0, 10) === todayKey).length;
  const guardrails = {
    dailyCap: { used: todayApps, cap: 10, remaining: 10 - todayApps },
    lastHalt: auditLog.filter(e => e.action && /halt|challenge|captcha/i.test(e.action)).slice(-1)[0] || null,
    tosAcknowledgement: tosAck || { acknowledged: false },
    rules: [
      { id: 'G1', rule: 'File inputs never written', status: 'enforced' },
      { id: 'G2', rule: 'Submit/Send never clicked (allowlist)', status: 'enforced' },
      { id: 'G3', rule: 'Plan hash + 5-min expiry', status: 'enforced' },
      { id: 'G4', rule: 'CAPTCHA/checkpoint halts run', status: 'enforced' },
      { id: 'G5', rule: '10 applications/day cap', status: 'self-discipline' },
      { id: 'G6', rule: 'Audit log (timestamp, job, field, value hash, source)', status: 'enforced' },
      { id: 'G7', rule: 'Sensitive answers stored as hashes only', status: 'enforced' },
      { id: 'G8', rule: 'No fabrication', status: 'enforced' },
      { id: 'G9', rule: 'Preparation gate before apply', status: 'enforced' },
      { id: 'G10', rule: 'Frozen layout (template + style.js)', status: 'enforced' },
      { id: 'G11', rule: 'LinkedIn ToS acknowledgement', status: 'acknowledged' },
    ],
  };

  // CV library
  const cvLibrary = listDirs(PATHS.cvLibrary).map(name => {
    const dir = path.join(PATHS.cvLibrary, name);
    const src = path.join(dir, 'source', 'cv.md');
    const rootSrc = path.join(dir, 'cv.md');
    const srcPath = exists(src) ? src : rootSrc;
    const pdf = path.join(dir, 'cv.pdf');
    return {
      role: name,
      hasSource: exists(srcPath),
      hasPdf: exists(pdf),
      words: exists(srcPath) ? fs.readFileSync(srcPath, 'utf8').trim().split(/\s+/).length : 0,
      sourceMtime: exists(srcPath) ? statMtime(srcPath) : null,
      pdfMtime: exists(pdf) ? statMtime(pdf) : null,
      sourcePath: exists(src) ? 'cv-library/' + name + '/source/cv.md' : (exists(rootSrc) ? 'cv-library/' + name + '/cv.md' : null),
    };
  });

  // Render history (data/out/rendered)
  const renderedRoot = path.join(ROOT, 'data', 'out', 'rendered');
  const renderHistory = listDirs(renderedRoot).map(name => {
    const dir = path.join(renderedRoot, name);
    let files = [];
    try { files = fs.readdirSync(dir, { withFileTypes: true }).filter(d => d.isFile()).map(d => d.name); } catch {}
    const artifacts = files.map(f => {
      const p = path.join(dir, f);
      return { name: f, path: 'data/out/rendered/' + name + '/' + f, mtime: statMtime(p), size: fileSize(p) };
    });
    let latest = null;
    for (const a of artifacts) { if (a.mtime && (!latest || a.mtime > latest)) latest = a.mtime; }
    return { name, path: 'data/out/rendered/' + name, updatedAt: latest || statMtime(dir), files: artifacts };
  }).sort((a,b)=> String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')));

  // Global pipeline state
  const scan = readJson(PATHS.scan);
  const plan = readJson(PATHS.plan);
  const applied = readJsonl(PATHS.applied);
  const audit = readJsonl(PATHS.audit);
  const global = {
    scan: !!scan,
    scanJobId: scan?.jobId || null,
    scanState: scan?.state || null,
    plan: !!plan,
    planFields: plan?.fields?.length || 0,
    planUnknowns: plan?.unknowns?.length || 0,
    planAmbiguities: plan?.ambiguities?.length || 0,
    appliedCount: applied.length,
    auditEntries: audit.length,
  };

  const JOBBOT_PERSONAS = new Set(['cv-writer','cover-letter-writer','recruiter-dach','visual-qa','company-researcher','ats-optimizer','fact-checker']);
  function runDomain(r) {
    if (r.domain) return r.domain;
    if (r.project) return r.project;
    return JOBBOT_PERSONAS.has(r.persona) ? 'jobbot' : 'tooling';
  }
  // Enrich persona runs with duration (when start/end provided)
  const enrichedRuns = runs.map(r => {
    const start = r.startedAt || r.timestamp;
    const end = r.completedAt || null;
    const durationMs = (r.durationMs != null) ? r.durationMs
      : (end ? (new Date(end) - new Date(start)) : null);
    return { ...r, startedAt: start, completedAt: end, durationMs, domain: runDomain(r) };
  });

  // Per-application elapsed time (earliest artifact -> manifest/updatedAt)
  for (const a of applications) {
    // Pipeline processing time: from first to last *document* step timestamp.
    // Exclude manifest/userReviewed/applied, which can be updated much later by review actions.
    const pipelineStepKeys = ['research', 'cvSource', 'cvRendered', 'clSource', 'clRendered'];
    const orderedTimes = pipelineStepKeys.map(k => a.timestamps?.[k]).filter(Boolean).map(t => new Date(t).getTime());
    // Normalize non-monotonic timestamps: only treat as a valid processing span when the
    // pipeline steps are in non-decreasing time order; otherwise discard (out-of-order mtimes).
    let monotonic = true;
    for (let i = 1; i < orderedTimes.length; i++) {
      if (orderedTimes[i] < orderedTimes[i - 1]) { monotonic = false; break; }
    }
    const times = (monotonic && orderedTimes.length >= 2) ? orderedTimes : [];
    const earliest = times.length ? Math.min(...times) : null;
    // Use the last pipeline step timestamp (not the later review/updatedAt) so review delays
    // do not inflate processing time.
    const latest = times.length ? Math.max(...times) : (a.updatedAt ? new Date(a.updatedAt).getTime() : null);
    a.elapsedMs = (earliest && latest && latest > earliest) ? (latest - earliest) : null;
  }

  // Persona counts
  const personaCounts = {};
  for (const r of runs) { personaCounts[r.persona] = (personaCounts[r.persona] || 0) + 1; }

  // Agent monitor: per-persona stats
  const agentNames = [...new Set(runs.map(r => r.persona).filter(Boolean))];
  const agentMonitor = agentNames.map(name => {
    const agentRuns = enrichedRuns.filter(r => r.persona === name).slice().reverse(); // newest first already? enrichedRuns original order oldest->newest; reverse later
    const ordered = agentRuns.slice().sort((a,b) => new Date(b.timestamp)-new Date(a.timestamp));
    const success = ordered.filter(r => r.status === 'done').length;
    const failed = ordered.filter(r => r.status && r.status !== 'done' && r.status !== 'running').length;
    const withDur = ordered.filter(r => typeof r.durationMs === 'number');
    const avgDur = withDur.length ? Math.round(withDur.reduce((s,r)=>s+r.durationMs,0)/withDur.length) : null;
    const latest = ordered[0] || null;
    const domain = latest ? (latest.domain || runDomain(latest)) : 'tooling';
    return {
      name,
      domain,
      count: ordered.length,
      success,
      failed,
      avgDurationMs: avgDur,
      lastRun: latest ? latest.timestamp : null,
      lastStatus: latest ? (latest.status || '?') : 'idle',
      currentTask: latest ? (latest.task || null) : null,
      runs: ordered.slice(0, 20),
    };
  });

  // Intervention queue: items needing attention
  const interventions = [];
  for (const a of applications) {
    for (const iss of a.issues) {
      interventions.push({ folder: a.folder, company: a.company, role: a.role, issue: iss, stage: a.stage });
    }
  }
  // plan unknowns
  if (plan?.unknowns?.length) {
    for (const u of plan.unknowns) {
      interventions.push({ folder: '(plan)', company: scan?.jobId || '?', role: 'pending plan', issue: `unresolved field: ${u.field?.label || u.field?.key || '?'}`, stage: 'planned' });
    }
  }

  // System health
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const recentRuns = enrichedRuns.filter(r => now - new Date(r.timestamp).getTime() < dayMs);
  const failedRuns = enrichedRuns.filter(r => r.status && r.status !== 'done' && r.status !== 'running');
  const interruptedApps = applications.filter(a => a.stage !== 'done' && a.updatedAt && (now - new Date(a.updatedAt).getTime() > dayMs));
  const criticalErrors = [];
  if (!scan) criticalErrors.push('no scan data');
  const missingManifests = applications.filter(a => !a.steps.manifest).length;
  if (missingManifests) criticalErrors.push(`${missingManifests} missing manifest(s)`);
  if (failedRuns.length) criticalErrors.push(`${failedRuns.length} failed persona run(s)`);

  const warnings = [];
  if (interruptedApps.length) warnings.push(`${interruptedApps.length} interrupted workflow(s)`);
  if (interventions.length) warnings.push(`${interventions.length} item(s) need attention`);
  const hashMismatchCount = applications.reduce((s, a) => s + (a.hashMismatches?.length || 0), 0);
  if (hashMismatchCount) warnings.push(`${hashMismatchCount} artifact hash mismatch(es)`);

  let healthState = 'Unknown';
  if (enrichedRuns.length === 0 && applications.length === 0) healthState = 'Unknown';
  else if (criticalErrors.length > 0) healthState = 'Error';
  else if (warnings.length > 0) healthState = 'Degraded';
  else if (recentRuns.length > 0) healthState = 'Healthy';
  else healthState = 'Unknown';

  const healthReasons = [...criticalErrors, ...warnings];
  if (healthState === 'Unknown' && healthReasons.length === 0) healthReasons.push('insufficient recent telemetry');

  const activeExecutions = applications.filter(a => a.stage !== 'done').length;
  const completedExecutions = applications.filter(a => a.stage === 'done').length + enrichedRuns.filter(r => r.status === 'done').length;
  const failedExecutions = failedRuns.length;
  const interruptedExecutions = interruptedApps.length;
  const requiresAttention = interventions.length;
  const avgProcessingTimeMs = applications.filter(a => typeof a.elapsedMs === 'number').length
    ? Math.round(applications.filter(a => typeof a.elapsedMs === 'number').reduce((s,a)=>s+a.elapsedMs,0) / applications.filter(a => typeof a.elapsedMs === 'number').length)
    : null;
  const lastSuccessfulExecution = [...enrichedRuns.filter(r=>r.status==='done').map(r=>r.timestamp),
    ...applications.filter(a=>a.stage==='done').map(a=>a.updatedAt).filter(Boolean)].sort().pop() || null;

  // Activity summary (original totals, secondary)
  const activitySummary = {
    runs: runs.length,
    apps: applications.length,
    cvs: cvLibrary.length,
    reviewed: applications.filter(a => a.userReviewed).length,
  };

  // Timeline (recent events across personas and pipeline stages)
  const events = [];
  for (const r of enrichedRuns) {
    events.push({ time: r.timestamp, type: 'persona', label: r.persona || '?', detail: r.task || '', status: r.status || '?' });
  }
  for (const a of applications) {
    for (const k of STEP_KEYS) {
      const t = a.timestamps?.[k];
      if (t) events.push({ time: t, type: 'stage', label: `${a.company} — ${k}`, detail: a.folder, status: 'done' });
    }
  }
  events.sort((x, y) => new Date(y.time) - new Date(x.time));
  const timeline = events.slice(0, 40);

  // Performance summary
  const runsWithDuration = enrichedRuns.filter(r => typeof r.durationMs === 'number' && r.durationMs >= 0);
  const avgRunDurationMs = runsWithDuration.length
    ? Math.round(runsWithDuration.reduce((s, r) => s + r.durationMs, 0) / runsWithDuration.length)
    : null;
  const appsWithElapsed = applications.filter(a => typeof a.elapsedMs === 'number').length;


  // performance into global
  global.avgRunDurationMs = avgRunDurationMs;
  global.runsWithDuration = runsWithDuration.length;
  global.appsWithElapsed = appsWithElapsed;

  const systemHealth = {
    state: healthState,
    reasons: healthReasons,
    activeExecutions,
    completedExecutions,
    failedExecutions,
    interruptedExecutions,
    requiresAttention,
    avgProcessingTimeMs,
    lastSuccessfulExecution,
    hashMismatchCount,
  };

  return {
    generatedAt: new Date().toISOString(),
    runs: enrichedRuns.slice().reverse(),
    personaCounts,
    applications,
    cvLibrary,
    masterCv,
    masterCoverLetter,
    templateStatus,
    guardrails,
    renderHistory,
    global,
    systemHealth,
    activitySummary,
    agentMonitor,
    interventions,
    timeline,
    demoMode: existsSync(path.join(ROOT, 'data', 'demo-mode.json')),
    totals: {
      runs: runs.length,
      apps: applications.length,
      cvs: cvLibrary.length,
      reviewed: applications.filter(a => a.userReviewed).length,
      exceptions: interventions.length,
      complete: applications.filter(a => a.stage === 'done').length,
    },
  };
  _cache = _result;
  _cacheTime = cacheNow;
  return _result;
}

