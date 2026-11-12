// tools/dashboard/public/app.js
// Client for the jobbot Control Tower: SSE live updates, keyed DOM diffing,
// localStorage persistence, filters, timeline, bulk selection, safe actions,
// and a live log console.

(function () {
  'use strict';

  // ---------- helpers ----------
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function relTime(iso) {
    if (!iso) return '-';
    var t = new Date(iso).getTime();
    if (isNaN(t)) return String(iso);
    var s = Math.round((Date.now() - t) / 1000);
    if (s < 5) return 'just now';
    if (s < 60) return s + 's ago';
    var m = Math.floor(s / 60); if (m < 60) return m + 'm ago';
    var h = Math.floor(m / 60); if (h < 24) return h + 'h ago';
    return Math.floor(h / 24) + 'd ago';
  }
  function setHtml(id, html) {
    var el = $(id); if (!el) return;
    if (el.dataset.sig === html) return;
    el.innerHTML = html; el.dataset.sig = html;
  }
  function load(key, fallback) {
    try { var v = localStorage.getItem('jobbot.dashboard.' + key); return v == null ? fallback : JSON.parse(v); }
    catch (e) { return fallback; }
  }
  function persist(key, value) {
    try { localStorage.setItem('jobbot.dashboard.' + key, JSON.stringify(value)); } catch (e) { /* ignore */ }
  }

  // ---------- state ----------
  var STEP_KEYS = ['research', 'cvSource', 'cvRendered', 'clSource', 'clRendered', 'manifest', 'userReviewed', 'applied'];
  var SIM_ACTIONS = ['retry-run', 'skip-stage'];
  var ACTION_LABEL = { 'mark-reviewed': 'Mark reviewed', 'mark-master-cv-reviewed': 'Mark master CV reviewed', 'mark-applied': 'Mark applied', 'force-rerender': 'Force re-render', 'retry-run': 'Retry run', 'skip-stage': 'Skip stage' };
  var TITLES = { overview: 'Overview', workflows: 'Jobs', agents: 'Agents', interventions: 'Action Items', timeline: 'Timeline', console: 'Live Console', browser: 'Browser Agent', docslib: 'Documents library', guardrails: 'Guardrails / Safety' };

  var storedFilters = load('filters', {}) || {};
  // Migrate legacy flat filter state to nested structure
  if (storedFilters && !storedFilters.agents && (storedFilters.company || storedFilters.role)) {
    // Old format: flat keys. Migrate to new nested format.
    var migrated = {
      company: storedFilters.company || '',
      role: storedFilters.role || '',
      date: storedFilters.date || '',
      stage: storedFilters.stage || '',
      status: storedFilters.status || '',
      agents: { persona: '', status: '', date: '' },
      agentRuns: { date: '', task: '', status: '' },
      interventions: { folder: '', company: '', issue: '', stage: '' },
      timeline: { date: '', label: '', detail: '', status: '' },
      renderHistory: { name: '', date: '', file: '' },
      docslibCv: { role: '', source: '', pdf: '', date: '' },
      guardrules: { id: '', rule: '', status: '' },
    };
    try { localStorage.setItem('jobbot.dashboard.filters', JSON.stringify(migrated)); } catch (e) { /* ignore */ }
    storedFilters = migrated;
  }
  var storedPrefs = load('prefs', {}) || {};
  var storedExpanded = load('expanded', []);
  var state = {
    data: null,
    view: load('view', 'overview'),
    expanded: new Set(Array.isArray(storedExpanded) ? storedExpanded : []),
    selected: new Set(),
    agent: load('agent', ''),
    filters: {
      company: storedFilters.company || '',
      role: storedFilters.role || '',
      date: storedFilters.date || '',
      stage: storedFilters.stage || '',
      status: storedFilters.status || '',
      agents: (storedFilters.agents && typeof storedFilters.agents === 'object') ? storedFilters.agents : {persona:'',status:'',date:''},
      agentRuns: (storedFilters.agentRuns && typeof storedFilters.agentRuns === 'object') ? storedFilters.agentRuns : {date:'',task:'',status:''},
      interventions: (storedFilters.interventions && typeof storedFilters.interventions === 'object') ? storedFilters.interventions : {folder:'',company:'',issue:'',stage:''},
      timeline: (storedFilters.timeline && typeof storedFilters.timeline === 'object') ? storedFilters.timeline : {date:'',label:'',detail:'',status:''},
      renderHistory: (storedFilters.renderHistory && typeof storedFilters.renderHistory === 'object') ? storedFilters.renderHistory : {name:'',date:'',file:''},
      docslibCv: (storedFilters.docslibCv && typeof storedFilters.docslibCv === 'object') ? storedFilters.docslibCv : {role:'',source:'',pdf:'',date:''},
      guardrules: (storedFilters.guardrules && typeof storedFilters.guardrules === 'object') ? storedFilters.guardrules : {id:'',rule:'',status:''},
    },
    tlFilter: load('tl', 'all'),
    prefs: { live: storedPrefs.live !== false, simulate: !!storedPrefs.simulate },
  };

  // ---------- keyed DOM diff ----------
  function patchRows(tbody, items) {
    if (!tbody) return;
    var existing = new Map();
    Array.prototype.forEach.call(tbody.children, function (tr) {
      if (tr.dataset && tr.dataset.key) existing.set(tr.dataset.key, tr);
    });
    var prev = null;
    items.forEach(function (it) {
      var tr = existing.get(it.key);
      if (!tr) { tr = document.createElement('tr'); tr.dataset.key = it.key; tr.dataset.sig = ''; }
      else { existing.delete(it.key); }
      if (tr.dataset.sig !== it.html) { tr.innerHTML = it.html; tr.dataset.sig = it.html; }
      if (it.folder !== undefined) tr.dataset.folder = it.folder;
      if (it.agent !== undefined) tr.dataset.agent = it.agent;
      if (it.id !== undefined) tr.id = it.id;
      tr.className = it.className || '';
      if (prev) { if (prev.nextSibling !== tr) tbody.insertBefore(tr, prev.nextSibling); }
      else if (tbody.firstChild !== tr) { tbody.insertBefore(tr, tbody.firstChild); }
      prev = tr;
    });
    existing.forEach(function (tr) { tr.remove(); });
    var empty = tbody.querySelector('[data-key="__empty"]');
    if (items.length === 0) {
      if (!empty) {
        var cols = tbody.closest('table') ? tbody.closest('table').querySelectorAll('thead th').length : 1;
        empty = document.createElement('tr');
        empty.dataset.key = '__empty';
        empty.innerHTML = '<td class="empty" colspan="' + (cols || 1) + '">nothing to show</td>';
        tbody.appendChild(empty);
      }
    } else if (empty) { empty.remove(); }
  }

  // ---------- health helpers ----------
  function stateClass(s) { return s === 'Healthy' ? 'ok' : s === 'Degraded' ? 'warn' : s === 'Error' ? 'bad' : 'muted'; }
  // One place decides badge colour so the same value never renders two different colours.
  function stageClass(stage) { return stage === 'done' || stage === 'applied' ? 'ok' : 'warn'; }
  function statusClass(status) {
    var s = String(status || '').toLowerCase();
    if (s === 'done' || s === 'success' || s === 'ok' || s === 'complete' || s === 'completed') return 'ok';
    if (s === 'running' || s === 'active' || s === 'pending') return 'warn';
    if (s === 'failed' || s === 'error' || s === 'interrupted' || s === 'blocked' || s === 'cancelled') return 'bad';
    return 'muted';
  }
  function prefersReducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
  function appHealth(a) {
    if ((a.hashMismatches || []).length) return 'bad';
    if ((a.issues || []).length) return 'warn';
    return 'ok';
  }
  function appHealthLabel(a) {
    if ((a.hashMismatches || []).length) return 'hash mismatch';
    if ((a.issues || []).length) return 'attention';
    return 'healthy';
  }

  function hasText(v, q) { return !q || String(v == null ? '' : v).toLowerCase().indexOf(String(q).toLowerCase()) !== -1; }
  function dateHas(v, q) { if (!q) return true; var s = String(v || ''); return s.indexOf(q) !== -1; }
  function yesNo(v, q) { if (!q) return true; return q === 'yes' ? !!v : !v; }
  function appliedTime(a) { return (a && a.timestamps && a.timestamps.applied) || (a && a.updatedAt) || (a && a.createdAt) || (a && a.date) || ''; }
  function workflowMatches(a, f) {
    f = f || {};
    if (!hasText(a.company, f.company)) return false;
    if (!hasText(a.role, f.role)) return false;
    if (!dateHas(a.date, f.date) && !dateHas(a.updatedAt, f.date) && !dateHas(appliedTime(a), f.date)) return false;
    if (f.stage && a.stage !== f.stage) return false;
    if (f.status && appHealth(a) !== f.status) return false;
    return true;
  }

  // ---------- renderers ----------
  function renderHealth(d) {
    var h = d.systemHealth || {};
    var cls = stateClass(h.state);
    $('healthBadge').innerHTML = '<span class="badge ' + cls + '">' + esc(h.state || 'Unknown') + '</span>';
    setHtml('health', '<div class="card" style="display:flex;align-items:center;gap:12px"><span class="badge ' + cls + '">' + esc(h.state || 'Unknown') + '</span><span class="muted">' + esc((h.reasons || []).join(' \u00b7 ')) + '</span></div>');
    setHtml('healthkpis', [
      ['Active executions', h.activeExecutions],
      ['Completed', h.completedExecutions],
      ['Failed', h.failedExecutions],
      ['Interrupted', h.interruptedExecutions],
      ['Requires attention', h.requiresAttention],
      ['Hash mismatches', h.hashMismatchCount != null ? h.hashMismatchCount : 'n/a'],
      ['Avg processing time', h.avgProcessingTimeMs != null ? (Math.round(h.avgProcessingTimeMs / 1000 * 10) / 10 + 's') : 'n/a'],
      ['Last success', h.lastSuccessfulExecution ? relTime(h.lastSuccessfulExecution) : 'n/a'],
    ].map(function (x) { return '<div class="gcard"><div class="label">' + x[0] + '</div><div class="value">' + x[1] + '</div></div>'; }).join(''));
  }

  function renderOverview(d) {
    var a = d.activitySummary || {};
    setHtml('kpis', [
      ['Persona runs', a.runs],
      ['Applications', a.apps],
      ['Role CVs', a.cvs],
      ['Reviewed apps', a.reviewed],
      ['Complete', (d.totals || {}).complete],
      ['Needs attention', (d.totals || {}).exceptions],
    ].map(function (x) { return '<div class="card"><div class="label">' + x[0] + '</div><div class="value">' + x[1] + '</div></div>'; }).join(''));
    var g = d.global || {};
    setHtml('global', [
      ['Scan present', g.scan ? 'yes' : 'no', g.scan],
      ['Scan job id', g.scanJobId || '-', g.scan],
      ['Scan state', g.scanState || '-', g.scan],
      ['Plan present', g.plan ? 'yes' : 'no', g.plan],
      ['Plan fields', g.planFields, g.plan],
      ['Plan unknowns', g.planUnknowns, true],
      ['Applied (logged)', g.appliedCount, true],
      ['Audit entries', g.auditEntries, true],
      ['Avg run duration', g.avgRunDurationMs != null ? (Math.round(g.avgRunDurationMs / 1000 * 10) / 10 + 's') : 'n/a', g.runsWithDuration > 0],
      ['Runs timed', g.runsWithDuration || 0, true],
      ['Apps timed', g.appsWithElapsed || 0, true],
    ].map(function (x) { return '<div class="gcard"><div class="label">' + x[0] + '</div><div class="value" style="color:' + (x[2] ? 'var(--ok)' : 'var(--muted)') + '">' + x[1] + '</div></div>'; }).join(''));
    setHtml('personas', Object.keys(d.personaCounts || {}).map(function (k) {
      return '<span>&#129302; ' + esc(k) + ' <b>x' + d.personaCounts[k] + '</b></span>';
    }).join(''));
  }

  function renderActive(d) {
    var items = (d.applications || []).filter(function (a) { return a.stage !== 'done'; }).map(function (a) {
      return { key: 'active:' + a.folder, html: '<td>' + esc(a.company) + '</td><td>' + esc(a.role) + '</td><td><span class="badge ' + stageClass(a.stage) + '">' + esc(a.stageLabel) + '</span></td><td class="muted">' + esc(a.updatedAt ? relTime(a.updatedAt) : '-') + '</td>' };
    });
    patchRows($('active'), items);
  }

  function appRowHtml(a) {
    var s = a.steps || {};
    var doneCount = STEP_KEYS.filter(function (k) { return s[k]; }).length;
    var pct = Math.round((doneCount / STEP_KEYS.length) * 100);
    var steps = STEP_KEYS.map(function (k) { return '<span class="step ' + (s[k] ? 'done' : '') + '" title="' + k + '"></span>'; }).join('');
    var progressBar = '<div style="display:flex;align-items:center;gap:4px;"><div style="flex:1;height:6px;border-radius:3px;background:rgba(255,255,255,0.08);overflow:hidden;"><div style="width:' + pct + '%;height:100%;border-radius:3px;background:linear-gradient(90deg,#00b4d8,#00ff88);transition:width .3s;"></div></div><span style="font-size:12px;color:var(--muted);min-width:28px;text-align:right;">' + pct + '%</span></div>';
    var h = appHealth(a);
    var checked = state.selected.has(a.folder) ? ' checked' : '';
    var expanded = state.expanded.has(a.folder);
    var detailId = 'detail-' + encodeURIComponent(a.folder);
    return '<td><input type="checkbox" class="rowchk" data-folder="' + esc(a.folder) + '" aria-label="Select workflow ' + esc(a.folder) + ' for ' + esc(a.company) + ' — ' + esc(a.role) + '"' + checked + '></td>'
      + '<td><button class="row-control" data-expand="' + esc(a.folder) + '" aria-expanded="' + expanded + '" aria-controls="' + detailId + '" aria-label="' + esc((expanded ? 'Hide details for ' : 'Show details for ') + a.folder + ' — ' + a.company + ' — ' + a.role) + '">' + esc(a.folder) + '</button></td>'
      + '<td>' + esc(a.company) + '</td><td>' + esc(a.role) + '</td>'
      + '<td><span class="badge ' + h + '">' + esc(appHealthLabel(a)) + '</span> <span class="badge muted">' + esc(a.status) + '</span></td>'
      + '<td><span class="badge ' + stageClass(a.stage) + '">' + esc(a.stageLabel) + '</span></td>'
      + '<td>' + progressBar + '</td><td>' + a.docs + '</td>';
  }

  function artifactCards(a) {
    var cards = (a.artifacts || []).map(function (x) {
      var rel = 'data/out/easy-apply/' + a.folder + '/' + (x.path || '');
      var href = x.path ? '/file?path=' + encodeURIComponent(rel) : null;
      var badge = x.hashMatches === true ? '<span class="badge ok">&#128274; verified</span>'
        : x.hashMatches === false ? '<span class="badge bad">&#9888; mismatch</span>'
        : '<span class="badge muted">no hash</span>';
      return '<div class="acard"><div class="acard-name">' + esc(x.name) + '</div>'
        + '<div class="acard-meta">' + badge + ' <span class="muted">' + esc(x.type) + '</span></div>'
        + '<div class="acard-meta muted">' + (x.size ? Math.round(x.size / 1024) + 'KB' : '') + ' ' + (x.generatedAt ? esc(relTime(x.generatedAt)) : '') + '</div>'
        + '<div class="acard-actions"><button data-copy="' + esc(rel) + '">Copy path</button>' + (href ? '<a href="' + href + '" target="_blank">Open</a>' : '') + '</div></div>';
    }).join('');
    return '<div class="acards">' + (cards || '<span class="muted">no documents</span>') + '</div>';
  }

  function linkButtons(a) {
    var out = '';
    var l = a.links || {};
    if (l.cvHtmlPath) out += '<a class="btn" href="/file?path=' + encodeURIComponent(l.cvHtmlPath) + '" target="_blank">CV html</a>';
    if (l.cvPdfPath) out += '<a class="btn" href="/file?path=' + encodeURIComponent(l.cvPdfPath) + '" target="_blank">CV pdf</a>';
    if (l.clHtmlPath) out += '<a class="btn" href="/file?path=' + encodeURIComponent(l.clHtmlPath) + '" target="_blank">CL html</a>';
    if (l.clPdfPath) out += '<a class="btn" href="/file?path=' + encodeURIComponent(l.clPdfPath) + '" target="_blank">CL pdf</a>';
    if (a.jobUrl) out += '<a class="btn" href="' + esc(a.jobUrl) + '" target="_blank">Job posting</a>';
    return out || '<span class="muted">no links</span>';
  }

  function detailHtml(a) {
    var issues = (a.issues || []).map(function (x) { return '<span class="badge warn">' + esc(x) + '</span>'; }).join(' ') || '<span class="muted">no issues</span>';
    var steps = STEP_KEYS.map(function (k) {
      var s = a.steps || {};
      return '<div class="row"><b>' + esc(k) + '</b>' + (s[k] ? '<span class="badge ok">done</span>' : '<span class="badge muted">missing</span>')
        + (a.timestamps && a.timestamps[k] ? ' <span class="muted">' + esc(new Date(a.timestamps[k]).toLocaleString()) + '</span>' : '') + '</div>';
    }).join('');
    var durs = (a.stageDurations || []).map(function (x) {
      return '<div class="row"><b>' + esc(x.stage) + '</b>' + (x.durationMs != null ? (Math.round(x.durationMs / 1000 * 10) / 10 + 's') : '-')
        + ' <span class="muted">' + esc(x.startedAt ? new Date(x.startedAt).toLocaleString() : '') + '</span></div>';
    }).join('') || '<span class="muted">no timestamps</span>';
    var actions = '<div class="actions">'
      + '<button data-act="mark-reviewed" data-folder="' + esc(a.folder) + '">Mark reviewed</button>'
      + '<button data-act="mark-master-cv-reviewed" data-folder="' + esc(a.folder) + '">Mark master CV reviewed</button>'
      + '<button data-act="force-rerender" data-folder="' + esc(a.folder) + '">Force re-render</button>'
      + '<button class="sim" data-act="retry-run" data-folder="' + esc(a.folder) + '">Retry run (sim)</button>'
      + '<button class="sim" data-act="skip-stage" data-folder="' + esc(a.folder) + '">Skip stage (sim)</button>'
      + '</div>';
    return '<td colspan="8"><div class="detail-box">'
      + '<h3>' + esc(a.company) + ' &mdash; ' + esc(a.role) + ' <span class="muted">' + (a.updatedAt ? 'updated ' + esc(relTime(a.updatedAt)) : '') + '</span></h3>'
      + '<div class="row"><b>stage</b><span class="badge ' + stageClass(a.stage) + '">' + esc(a.stageLabel) + '</span><b>status</b>' + esc(a.status) + '</div>'
      + '<div class="row"><b>issues</b>' + issues + '</div>'
      + '<div class="row"><b>master CV review</b><span class="badge ' + (a.masterCvReviewed ? 'ok' : 'warn') + '">' + (a.masterCvReviewed ? 'acknowledged' : 'pending') + '</span></div>'
      + '<div class="sub-title">Preparation gate</div>'
      + '<div class="row"><span class="badge ' + ((a.steps && a.steps.research) ? 'ok' : 'muted') + '">' + ((a.steps && a.steps.research) ? '\u2713' : '\u25CB') + '</span> Job description &amp; research</div>'
      + '<div class="row"><span class="badge ' + (a.masterCvReviewed ? 'ok' : 'muted') + '">' + (a.masterCvReviewed ? '\u2713' : '\u25CB') + '</span> Master CV reviewed</div>'
      + '<div class="row"><span class="badge ' + ((a.steps && a.steps.cvRendered) ? 'ok' : 'muted') + '">' + ((a.steps && a.steps.cvRendered) ? '\u2713' : '\u25CB') + '</span> Tailored CV rendered</div>'
      + '<div class="row"><span class="badge ' + ((a.steps && a.steps.clRendered) ? 'ok' : 'muted') + '">' + ((a.steps && a.steps.clRendered) ? '\u2713' : '\u25CB') + '</span> Tailored cover letter rendered</div>'
      + '<div class="row"><span class="badge ' + ((a.steps && a.steps.userReviewed) ? 'ok' : 'muted') + '">' + ((a.steps && a.steps.userReviewed) ? '\u2713' : '\u25CB') + '</span> User reviewed documents</div>'
      + (a.researchCompanyPath || a.researchJobPath ? '<div class="row"><b>research</b>'
        + (a.researchCompanyPath ? '<a class="btn" href="/file?path=' + encodeURIComponent(a.researchCompanyPath) + '" target="_blank">Company research</a> ' : '')
        + (a.researchJobPath ? '<a class="btn" href="/file?path=' + encodeURIComponent(a.researchJobPath) + '" target="_blank">Job description</a>' : '')
        + '</div>' : '')
      + actions
      + '<div class="sub-title">Steps</div>' + steps
      + '<div class="sub-title">Stage durations</div>' + durs
      + '<div class="sub-title">Artifacts</div>' + artifactCards(a)
      + '<div class="sub-title">Links</div><div class="actions">' + linkButtons(a) + '</div>'
      + '</div></td>';
  }

  function filteredApps() {
    var d = state.data; if (!d) return [];
    return (d.applications || []).filter(function (a) { return workflowMatches(a, state.filters); }).sort(function (x, y) {
      var xa = x.steps && x.steps.applied ? 1 : 0;
      var ya = y.steps && y.steps.applied ? 1 : 0;
      if (xa !== ya) return ya - xa; // completed/applied jobs first, last applied at top
      var xt = xa ? appliedTime(x) : (x.date || x.updatedAt || '');
      var yt = ya ? appliedTime(y) : (y.date || y.updatedAt || '');
      var cmp = String(yt).localeCompare(String(xt));
      if (cmp !== 0) return cmp;
      return String(y.folder || '').localeCompare(String(x.folder || ''));
    });
  }

  function syncCheckboxes() {
    var boxes = $('apps').querySelectorAll('input.rowchk[data-folder]');
    Array.prototype.forEach.call(boxes, function (chk) { chk.checked = state.selected.has(chk.dataset.folder); });
    var all = $('selectAll');
    if (all) all.checked = boxes.length > 0 && Array.prototype.every.call(boxes, function (b) { return b.checked; });
    updateBulk();
  }

  function updateBulk() {
    var n = state.selected.size;
    $('bulkCount').textContent = n + ' selected';
    $('bulkReview').disabled = n === 0;
    $('bulkRerender').disabled = n === 0;
    $('bulkClear').disabled = n === 0;
  }

  function computeNextAction(d) {
    var apps = d.applications || [];
    if (!apps.length) return 'No applications yet. Use "jobbot intake <url>" to create one.';
    var pending = apps.filter(function (a) { return !(a.steps && a.steps.applied); });
    if (!pending.length) return 'All applications are complete. Great work!';
    var best = null, bestScore = -1;
    pending.forEach(function (a) {
      var s = a.steps || {};
      var done = STEP_KEYS.filter(function (k) { return s[k]; }).length;
      var score = done;
      if (a.issues && a.issues.length) score += 0.5;
      if (!a.masterCvReviewed) score += 0.3;
      if (score > bestScore) { bestScore = score; best = a; }
    });
    if (!best) return 'No action needed.';
    var s = best.steps || {};
    var missing = STEP_KEYS.filter(function (k) { return !s[k]; });
    var nextStep = missing.length ? missing[0] : 'review';
    var stepLabels = { research: 'research', cvSource: 'CV source', cvRendered: 'render CV', clSource: 'cover letter source', clRendered: 'render cover letter', manifest: 'manifest', userReviewed: 'user review', applied: 'applied' };
    var gate = [];
    if (!best.masterCvReviewed) gate.push('master CV review');
    if (best.issues && best.issues.length) gate.push(best.issues[0]);
    var msg = best.company + ' - ' + best.role + ': next step is ' + (stepLabels[nextStep] || nextStep);
    if (gate.length) msg += ' (gate: ' + gate.join(', ') + ')';
    return msg;
  }

  function renderBrowser() {
    var d = state.data; if (!d) return;
    var fields = (d.scan && d.scan.fields) || [];
    var rows = fields.map(function (f) {
      return '<tr><td>' + esc(f.label || f.name || '-') + '</td><td>' + esc(f.value || '-') + '</td>'
        + '<td><span class="badge ' + (f.confidence === 'high' ? 'ok' : f.confidence === 'medium' ? 'warn' : 'muted') + '">' + esc(f.confidence || '-') + '</span></td>'
        + '<td><span class="badge muted">' + esc(f.status || 'pending') + '</span></td></tr>';
    }).join('');
    if ($('browserFields')) $('browserFields').innerHTML = rows || '<tr><td colspan="4" class="muted">No scan data. Run "jobbot scan" first.</td></tr>';
  }

  function renderWorkflows() {
    var d = state.data; if (!d) return;
    renderActive(d);
    var stageSel = $('fStage');
    var stages = [];
    (d.applications || []).forEach(function (a) { if (a.stage && stages.indexOf(a.stage) === -1) stages.push(a.stage); });
    stages.sort();
    if (stageSel.dataset.opts !== stages.join(',')) {
      var cur = stageSel.value || state.filters.stage || '';
      stageSel.innerHTML = '<option value="">All stages</option>' + stages.map(function (s) { return '<option value="' + esc(s) + '">' + esc(s) + '</option>'; }).join('');
      stageSel.dataset.opts = stages.join(',');
      stageSel.value = stages.indexOf(cur) !== -1 ? cur : '';
      if (stageSel.value !== state.filters.stage) { state.filters.stage = stageSel.value; persist('filters', state.filters); }
    }
    var apps = filteredApps();
    var items = [];
    apps.forEach(function (a) {
      items.push({ key: 'app:' + a.folder, folder: a.folder, className: 'clickable', html: appRowHtml(a) });
      items.push({ key: 'detail:' + a.folder, folder: a.folder, id: 'detail-' + encodeURIComponent(a.folder), className: 'detail' + (state.expanded.has(a.folder) ? ' open' : ''), html: detailHtml(a) });
    });
    patchRows($('apps'), items);
    syncCheckboxes();
    $('filterCount').textContent = apps.length + ' / ' + (d.applications || []).length + ' shown';
    var nextAct = computeNextAction(d);
    if ($('nextActionText')) $('nextActionText').textContent = nextAct;
  }

  function agentRowHtml(a) {
    return '<td><button class="row-control" data-agent-select="' + esc(a.name) + '" aria-label="Inspect runs for ' + esc(a.name) + '">' + esc(a.name) + '</button></td><td>' + a.count + '</td><td>' + a.success + '</td><td>' + a.failed + '</td>'
      + '<td class="muted">' + (a.avgDurationMs != null ? Math.round(a.avgDurationMs / 1000 * 10) / 10 + 's' : '-') + '</td>'
      + '<td><span class="badge ' + statusClass(a.lastStatus) + '">' + esc(a.lastStatus) + '</span></td>'
      + '<td class="muted">' + (a.lastRun ? esc(relTime(a.lastRun)) : '-') + '</td>';
  }

  function filteredAgentMonitor() {
    var d = state.data; if (!d) return [];
    var f = (state.filters && state.filters.agents) || {};
    return (d.agentMonitor || []).filter(function (a) {
      if (!hasText(a.name, f.persona)) return false;
      var cls = statusClass(a.lastStatus);
      if (f.status && cls !== f.status && String(a.lastStatus||'').toLowerCase() !== String(f.status).toLowerCase()) return false;
      if (!dateHas(a.lastRun, f.date)) return false;
      return true;
    });
  }

  function renderAgents() {
    var d = state.data; if (!d) return;
    var agents = filteredAgentMonitor();
    patchRows($('agents'), agents.map(function (a) { return { key: 'agent:' + a.name, agent: a.name, className: 'clickable', html: agentRowHtml(a) }; }));
    if ($('faCount')) $('faCount').textContent = agents.length + ' / ' + ((d.agentMonitor || []).length) + ' shown';
    var sel = $('agentSelect');
    var names = (d.agentMonitor || []).map(function (a) { return a.name; });
    if (sel.dataset.names !== names.join('|')) {
      sel.innerHTML = names.map(function (n) { return '<option value="' + esc(n) + '">' + esc(n) + '</option>'; }).join('');
      sel.dataset.names = names.join('|');
    }
    if (state.agent && names.indexOf(state.agent) !== -1) sel.value = state.agent;
    else if (names.length && !sel.value) sel.value = names[0];
    if (sel.value) state.agent = sel.value;
    renderAgentRuns();
  }

  function renderAgentRuns() {
    var d = state.data; if (!d) return;
    var name = $('agentSelect') ? $('agentSelect').value : state.agent;
    var am = (d.agentMonitor || []).find(function (x) { return x.name === name; });
    var runs = (am && am.runs) || [];
    var f = (state.filters && state.filters.agentRuns) || {};
    var filtered = runs.filter(function (r) {
      if (!dateHas(r.timestamp, f.date)) return false;
      if (!hasText(r.task, f.task)) return false;
      if (f.status) {
        var rs = String(r.status || '').toLowerCase();
        if (f.status === 'failed') { if (rs === 'done' || rs === 'running') return false; }
        else if (rs !== f.status) return false;
      }
      return true;
    });
    patchRows($('agentRuns'), filtered.map(function (r, i) {
      var dur = r.durationMs != null ? Math.round(r.durationMs / 1000 * 10) / 10 + 's' : '-';
      return {
        key: 'run:' + (r.timestamp || i) + ':' + (r.task || ''),
        html: '<td class="muted">' + esc(r.timestamp ? new Date(r.timestamp).toLocaleString() : '-') + '</td><td>' + esc(r.task || '') + '</td>'
          + '<td><span class="badge ' + statusClass(r.status) + '">' + esc(r.status || '?') + '</span></td>'
          + '<td class="muted">' + dur + '</td><td class="outputs">' + esc((r.outputs || []).join('\n')) + '</td>'
      };
    }));
    if ($('farCount')) $('farCount').textContent = filtered.length + ' / ' + runs.length + ' shown';
  }

  function cvLibRows(list) {
    return (list || []).map(function (c) {
      return {
        key: 'cv:' + c.role,
        html: '<td>' + esc(c.role) + '</td><td>' + (c.hasSource ? '&#9989;' : '&#10060;') + '</td><td>' + (c.hasPdf ? '&#9989;' : '&#10060;') + '</td>'
          + '<td>' + c.words + '</td><td class="muted">' + esc(c.pdfMtime ? relTime(c.pdfMtime) : '-') + '</td>'
      };
    });
  }
  function filteredCvLibrary(list, f) {
    f = f || {};
    return (list || []).filter(function (c) {
      if (!hasText(c.role, f.role)) return false;
      if (!yesNo(c.hasSource, f.source)) return false;
      if (!yesNo(c.hasPdf, f.pdf)) return false;
      if (!dateHas(c.pdfMtime, f.date)) return false;
      return true;
    });
  }

  function renderInterventions() {
    var d = state.data; if (!d) return;
    var apps = d.applications || [];
    var f = (state.filters && state.filters.interventions) || {};
    var all = d.interventions || [];
    var filtered = all.filter(function (x) {
      if (!hasText(x.folder, f.folder)) return false;
      if (!hasText(x.company, f.company)) return false;
      if (!hasText(x.issue, f.issue)) return false;
      if (!hasText(x.stage, f.stage)) return false;
      return true;
    });
    patchRows($('interventions'), filtered.map(function (x, i) {
      var app = apps.find(function (a) { return a.folder === x.folder; });
      return {
        key: 'iv:' + (x.folder || '?') + ':' + (x.issue || '') + ':' + i,
        folder: app ? x.folder : undefined,
        className: app ? 'clickable' : '',
        html: '<td>' + (app ? '<button class="row-control" data-open-workflow="' + esc(x.folder) + '" aria-label="Open workflow for ' + esc(x.company) + ' - ' + esc(x.role) + '">' + esc(x.folder) + '</button>' : esc(x.folder)) + '</td><td>' + esc(x.company) + '</td><td><span class="badge warn">' + esc(x.issue) + '</span></td><td>' + esc(x.stage) + '</td>'
      };
    }));
    if ($('fiCount')) $('fiCount').textContent = filtered.length + ' / ' + all.length + ' shown';
  }

  function renderTimeline() {
    var d = state.data; if (!d) return;
    var ev = d.timeline || [];
    var ftab = state.tlFilter;
    if (ftab === 'errors') ev = ev.filter(function (e) { return statusClass(e.status) === 'bad'; });
    else if (ftab === 'agent') ev = ev.filter(function (e) { return e.type === 'persona'; });
    else if (ftab === 'system') ev = ev.filter(function (e) { return e.type !== 'persona'; });
    var total = ev.length;
    var tf = (state.filters && state.filters.timeline) || {};
    ev = ev.filter(function (e) {
      if (!dateHas(e.time, tf.date)) return false;
      if (!hasText(e.type, tf.label) && !hasText(e.label, tf.label)) return false;
      if (!hasText(e.detail, tf.detail)) return false;
      if (!hasText(e.status, tf.status)) return false;
      return true;
    });
    patchRows($('timeline'), ev.map(function (e) {
      return {
        key: 'tl:' + (e.time || '') + ':' + (e.type || '') + ':' + (e.label || ''),
        html: '<td class="muted">' + esc(e.time ? relTime(e.time) : '-') + '</td><td>' + esc(e.type) + '</td><td>' + esc(e.label) + '</td>'
          + '<td class="muted">' + esc(e.detail || '') + '</td><td><span class="badge ' + statusClass(e.status) + '">' + esc(e.status) + '</span></td>'
      };
    }));
    if ($('ftCount')) $('ftCount').textContent = ev.length + ' / ' + total + ' shown';
  }

  function renderDocslib() {
    var d = state.data; if (!d) { setHtml('masterCvBlock', '<div class="muted">Loading...</div>'); setHtml('templateStatusBlock', '<div class="muted">Loading...</div>'); return; }
    var m = d.masterCv || {};
    var mHtml = '<div class="card"><div class="row"><b>Path</b>' + esc(m.path || '-') + (m.path ? ' <a class="btn" href="/file?path=' + encodeURIComponent(m.path) + '" target="_blank">Open</a>' : '') + '</div>'
      + '<div class="row"><b>Exists</b><span class="badge ' + (m.exists ? 'ok' : 'bad') + '">' + (m.exists ? 'yes' : 'no') + '</span></div>'
      + '<div class="row"><b>Words</b>' + esc(m.words) + '</div><div class="row"><b>Updated</b>' + esc(m.mtime ? relTime(m.mtime) : '-') + '</div></div>';
    setHtml('masterCvBlock', mHtml);

    var cl = d.masterCoverLetter || {};
    var clHtml = '<div class="card"><div class="row"><b>Path</b>' + esc(cl.path || '-') + (cl.path ? ' <a class="btn" href="/file?path=' + encodeURIComponent(cl.path) + '" target="_blank">Open</a>' : '') + '</div>'
      + '<div class="row"><b>Exists</b><span class="badge ' + (cl.exists ? 'ok' : 'bad') + '">' + (cl.exists ? 'yes' : 'no') + '</span></div>'
      + '<div class="row"><b>Words</b>' + esc(cl.words) + '</div><div class="row"><b>Updated</b>' + esc(cl.mtime ? relTime(cl.mtime) : '-') + '</div></div>';
    setHtml('masterClBlock', clHtml);

    var t = d.templateStatus || {};
    var tHtml = '<div class="card"><div class="row"><b>Template</b><span class="badge ' + (t.templateExists ? 'ok' : 'bad') + '">' + (t.templateExists ? 'present' : 'missing') + '</span> <span class="muted">templates/pdf-template.html</span></div>'
      + '<div class="row"><b>Style</b><span class="badge ' + (t.styleExists ? 'ok' : 'bad') + '">' + (t.styleExists ? 'present' : 'missing') + '</span> <span class="muted">src/render/style.js</span></div>'
      + '<div class="row"><b>Frozen</b><span class="badge ' + (t.frozen ? 'ok' : 'warn') + '">' + (t.frozen ? 'yes' : 'no') + '</span></div>'
      + '<div class="row"><b>Tokens</b><span class="muted">' + esc(t.styleTokens || '-') + '</span></div></div>';
    setHtml('templateStatusBlock', tHtml);

    var rhAll = d.renderHistory || [];
    var rf = (state.filters && state.filters.renderHistory) || {};
    var rh = rhAll.filter(function (r) {
      if (!hasText(r.name, rf.name)) return false;
      if (!dateHas(r.updatedAt, rf.date)) return false;
      if (rf.file) {
        var files = (r.files || []).map(function (f) { return f.name; }).join(' ');
        if (!hasText(files, rf.file)) return false;
      }
      return true;
    });
    patchRows($('renderHistory'), rh.map(function (r) {
      var arts = (r.files || []).map(function (f) {
        return '<a href="/file?path=' + encodeURIComponent(f.path) + '" target="_blank">' + esc(f.name) + '</a>';
      }).join(' &middot; ') || '<span class="muted">no files</span>';
      return { key: 'rh:' + r.name, html: '<td>' + esc(r.name) + '</td><td class="muted">' + esc(r.updatedAt ? relTime(r.updatedAt) : '-') + '</td><td class="outputs">' + arts + '</td>' };
    }));
    if ($('frCount')) $('frCount').textContent = rh.length + ' / ' + rhAll.length + ' shown';

    var cvAll = d.cvLibrary || [];
    var cvf = (state.filters && state.filters.docslibCv) || {};
    var cvFiltered = filteredCvLibrary(cvAll, cvf);
    patchRows($('docslibCv'), cvLibRows(cvFiltered));
    if ($('fdCount')) $('fdCount').textContent = cvFiltered.length + ' / ' + cvAll.length + ' shown';
  }

  function renderGuardrails() {
    var d = state.data; if (!d) { setHtml('guardrailSummary', '<div class="muted">Loading...</div>'); return; }
    var g = d.guardrails || {};
    var cap = g.dailyCap || {};
    var summary = [
      ['Daily cap', (cap.used != null ? cap.used : '?') + ' / ' + (cap.cap != null ? cap.cap : '?') + ' (remaining ' + (cap.remaining != null ? cap.remaining : '?') + ')', (cap.remaining || 0) > 0],
      ['Last halt', g.lastHalt ? ((g.lastHalt.action || g.lastHalt.event || 'halt') + ' @ ' + (g.lastHalt.ts || g.lastHalt.time || '-')) : 'none', !g.lastHalt],
    ].map(function (x) { return '<div class="gcard"><div class="label">' + x[0] + '</div><div class="value" style="font-size:14px;color:' + (x[2] ? 'var(--ok)' : 'var(--warn)') + '">' + esc(x[1]) + '</div></div>'; }).join('');
    setHtml('guardrailSummary', summary);

    var rulesAll = g.rules || [];
    var gf = (state.filters && state.filters.guardrules) || {};
    var rules = rulesAll.filter(function (r) {
      if (!hasText(r.id, gf.id)) return false;
      if (!hasText(r.rule, gf.rule)) return false;
      if (!hasText(r.status, gf.status)) return false;
      return true;
    });
    patchRows($('guardrailRules'), rules.map(function (r) {
      var cls = r.status === 'enforced' ? 'ok' : r.status === 'acknowledged' ? 'warn' : 'muted';
      return { key: 'gr:' + r.id, html: '<td>' + esc(r.id) + '</td><td>' + esc(r.rule) + '</td><td><span class="badge ' + cls + '">' + esc(r.status) + '</span></td>' };
    }));
    if ($('fgCount')) $('fgCount').textContent = rules.length + ' / ' + rulesAll.length + ' shown';

    var tosData = g.tosAcknowledgement || {};
    var tos = (rulesAll.find(function (r) { return /ToS|LinkedIn/i.test(r.rule || ''); }) || null);
    var tosStatus = tosData.acknowledged ? 'acknowledged' : 'not acknowledged';
    var tosDate = tosData.acknowledgedAt ? relTime(tosData.acknowledgedAt) : '-';
    setHtml('tosAck', '<div class="row"><b>Status</b><span class="badge ' + (tosData.acknowledged ? 'ok' : 'bad') + '">' + esc(tosStatus) + '</span></div>'
      + '<div class="row"><b>Acknowledged</b>' + esc(tosDate) + ' by ' + esc(tosData.acknowledgedBy || 'user') + '</div>'
      + '<div class="row"><b>Terms</b><span class="muted">' + esc(tosData.terms || 'LinkedIn Terms of Service and platform policies') + '</span></div>'
      + '<div class="muted">Read-only. Automation must respect LinkedIn Terms of Service and platform policies.</div>');
  }

  function renderAll() {
    var d = state.data; if (!d) return;
    renderHealth(d);
    renderOverview(d);
    renderWorkflows();
    renderAgents();
    renderInterventions();
    renderTimeline();
    renderBrowser();
    renderDocslib();
    renderGuardrails();
  }

  // ---------- actions ----------
  function toast(msg) {
    var t = $('toast'); if (!t) return;
    t.textContent = msg; t.classList.remove('hidden');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.classList.add('hidden'); }, 4500);
  }

  function confirmAction(title, text) {
    return new Promise(function (resolve) {
      $('modalTitle').textContent = title;
      $('modalText').textContent = text;
      var modal = $('modal');
      var trigger = document.activeElement;
      function cleanup() {
        if (modal.open) modal.close();
        $('modalYes').removeEventListener('click', yes);
        $('modalNo').removeEventListener('click', no);
        modal.removeEventListener('cancel', cancel);
        if (trigger && typeof trigger.focus === 'function') trigger.focus();
      }
      function yes() { cleanup(); resolve(true); }
      function no() { cleanup(); resolve(false); }
      function cancel(event) { event.preventDefault(); cleanup(); resolve(false); }
      $('modalYes').addEventListener('click', yes);
      $('modalNo').addEventListener('click', no);
      modal.addEventListener('cancel', cancel);
      modal.showModal();
      $('modalNo').focus();
    });
  }

  async function runAction(action, folders) {
    if (!folders || !folders.length) return;
    var sim = state.prefs.simulate || SIM_ACTIONS.indexOf(action) !== -1;
    var label = ACTION_LABEL[action] || action;
    var ok = await confirmAction(label, (sim ? 'SIMULATED \u2014 no files will change. ' : '') + 'Apply "' + label + '" to ' + folders.length + ' application(s)?' + (sim ? '' : ' This modifies application files.'));
    if (!ok) return;
    try {
      var r = await fetch('/api/action', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: action, folders: folders, simulate: sim }),
      });
      var j = await r.json();
      if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status));
      var results = j.results || [];
      var okN = results.filter(function (x) { return x.ok; }).length;
      var firstErr = results.find(function (x) { return !x.ok; });
      var message = label + ': ' + okN + '/' + results.length + ' succeeded' + (sim ? ' (simulated)' : '');
      if (firstErr) message += ' \u2014 ' + firstErr.error;
      if (j.audit && !j.audit.ok) message += ' \u2014 Audit log failed: ' + j.audit.error + '. Check workflow state before retrying.';
      toast(message);
    } catch (e) {
      toast('Action failed: ' + e.message);
    }
  }

  function copyText(t) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(t).then(function () { toast('Copied: ' + t); }, function () { toast('Copy failed'); });
    } else { toast('Clipboard unavailable'); }
  }

  // ---------- console ----------
  var MAX_LINES = 500;
  function appendLogs(lines) {
    var c = $('console');
    if (!c) return;
    var follow = $('consoleFollow') ? $('consoleFollow').checked : true;
    lines.forEach(function (line) {
      var d = document.createElement('div');
      d.className = 'ln' + (/error|fail|exception|traceback/i.test(line) ? ' err' : /^: |\[sys\]/i.test(line) ? ' sys' : '');
      d.textContent = line;
      c.appendChild(d);
    });
    while (c.children.length > MAX_LINES) c.removeChild(c.firstChild);
    if (follow) c.scrollTop = c.scrollHeight;
  }

  var simTimer = null, simN = 0;
  function startSim() {
    if (simTimer) return;
    simTimer = setInterval(function () {
      simN++;
      appendLogs(['[SIM ' + new Date().toLocaleTimeString() + '] persona=cv-writer step=' + (simN % 5) + ' (simulated)']);
    }, 1500);
  }
  function stopSim() { if (simTimer) { clearInterval(simTimer); simTimer = null; } }

  // ---------- wiring ----------
  function showView(v) {
    if (!TITLES[v]) v = 'overview';
    state.view = v; persist('view', v);
    Array.prototype.forEach.call(document.querySelectorAll('.nav-btn'), function (b) {
      var active = b.dataset.view === v;
      b.classList.toggle('active', active);
      if (active) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    });
    Array.prototype.forEach.call(document.querySelectorAll('.view'), function (sec) { sec.classList.toggle('active', sec.id === 'view-' + v); });
    $('viewTitle').textContent = TITLES[v];
    if (v === 'workflows') renderWorkflows();
    if (v === 'timeline') renderTimeline();
    if (v === 'agents') renderAgents();
    if (v === 'interventions') renderInterventions();
    if (v === 'browser') renderBrowser();
    if (v === 'docslib') renderDocslib();
    if (v === 'guardrails') renderGuardrails();
    if (v === 'console' && state.prefs.simulate) startSim();
  }

  function bindFilter(id, getter, render) {
    var el = $(id); if (!el) return;
    var ev = (el.tagName === 'SELECT') ? 'change' : 'input';
    el.addEventListener(ev, function () { getter(); persist('filters', state.filters); render(); });
  }
  function bindClear(id, reset, render) {
    var el = $(id); if (!el) return;
    el.addEventListener('click', function () { reset(); persist('filters', state.filters); render(); });
  }

  function wire() {
    Array.prototype.forEach.call(document.querySelectorAll('.nav-btn'), function (b) {
      b.addEventListener('click', function () { showView(b.dataset.view); });
    });

    // workflows filters
    function onFilter() {
      state.filters.company = $('fCompany').value;
      state.filters.role = $('fRole').value;
      state.filters.date = $('fDate') ? $('fDate').value : (state.filters.date || '');
      state.filters.stage = $('fStage').value;
      state.filters.status = $('fStatus').value;
      persist('filters', state.filters);
      renderWorkflows();
    }
    ['fCompany','fRole','fDate'].forEach(function(id){ var el=$(id); if(el) el.addEventListener('input', onFilter); });
    ['fStage','fStatus'].forEach(function(id){ var el=$(id); if(el) el.addEventListener('change', onFilter); });
    if ($('fClear')) $('fClear').addEventListener('click', function () {
      if($('fCompany')) $('fCompany').value = ''; if($('fRole')) $('fRole').value = ''; if($('fDate')) $('fDate').value = ''; if($('fStage')) $('fStage').value = ''; if($('fStatus')) $('fStatus').value = '';
      onFilter();
    });

    // bulk
    if ($('selectAll')) $('selectAll').addEventListener('change', function (e) {
      var boxes = $('apps').querySelectorAll('input.rowchk[data-folder]');
      Array.prototype.forEach.call(boxes, function (b) {
        if (e.target.checked) state.selected.add(b.dataset.folder); else state.selected.delete(b.dataset.folder);
      });
      syncCheckboxes();
    });
    if ($('bulkReview')) $('bulkReview').addEventListener('click', function () { runAction('mark-reviewed', Array.from(state.selected)); });
    if ($('bulkRerender')) $('bulkRerender').addEventListener('click', function () { runAction('force-rerender', Array.from(state.selected)); });
    if ($('bulkClear')) $('bulkClear').addEventListener('click', function () { state.selected.clear(); syncCheckboxes(); });

    // apps delegation
    if ($('apps')) $('apps').addEventListener('click', function (e) {
      if (e.target.matches('input.rowchk')) return;
      var btn = e.target.closest('button[data-act]');
      if (btn) { e.stopPropagation(); runAction(btn.dataset.act, [btn.dataset.folder]); return; }
      var cp = e.target.closest('[data-copy]');
      if (cp) { e.stopPropagation(); copyText(cp.dataset.copy); return; }
      var expander = e.target.closest('button[data-expand]');
      if (expander) { e.stopPropagation(); toggleDetail(expander.dataset.expand); }
    });
    if ($('apps')) $('apps').addEventListener('change', function (e) {
      var chk = e.target.closest('input.rowchk'); if (!chk) return;
      if (chk.checked) state.selected.add(chk.dataset.folder); else state.selected.delete(chk.dataset.folder);
      updateBulk();
      var all = $('selectAll');
      var boxes = $('apps').querySelectorAll('input.rowchk[data-folder]');
      if (all) all.checked = boxes.length > 0 && Array.prototype.every.call(boxes, function (b) { return b.checked; });
    });

    // agents
    bindFilter('faPersona', function(){ state.filters.agents.persona = $('faPersona').value; }, renderAgents);
    bindFilter('faStatus', function(){ state.filters.agents.status = $('faStatus').value; }, renderAgents);
    bindFilter('faDate', function(){ state.filters.agents.date = $('faDate').value; }, renderAgents);
    bindClear('faClear', function(){ state.filters.agents = {persona:'',status:'',date:''}; if($('faPersona')) $('faPersona').value=''; if($('faStatus')) $('faStatus').value=''; if($('faDate')) $('faDate').value=''; }, renderAgents);

    if ($('agents')) $('agents').addEventListener('click', function (e) {
      var select = e.target.closest('button[data-agent-select]'); if (!select) return;
      state.agent = select.dataset.agentSelect; persist('agent', state.agent);
      if ($('agentSelect')) $('agentSelect').value = state.agent; renderAgentRuns();
    });
    if ($('agentSelect')) $('agentSelect').addEventListener('change', function (e) {
      state.agent = e.target.value; persist('agent', state.agent); renderAgentRuns();
    });
    bindFilter('farDate', function(){ state.filters.agentRuns.date = $('farDate').value; }, renderAgentRuns);
    bindFilter('farTask', function(){ state.filters.agentRuns.task = $('farTask').value; }, renderAgentRuns);
    bindFilter('farStatus', function(){ state.filters.agentRuns.status = $('farStatus').value; }, renderAgentRuns);
    bindClear('farClear', function(){ state.filters.agentRuns = {date:'',task:'',status:''}; if($('farDate')) $('farDate').value=''; if($('farTask')) $('farTask').value=''; if($('farStatus')) $('farStatus').value=''; }, renderAgentRuns);

    // interventions
    if ($('interventions')) $('interventions').addEventListener('click', function (e) {
      var link = e.target.closest('button[data-open-workflow]'); if (!link) return;
      var folder = link.dataset.openWorkflow;
      if (!state.expanded.has(folder)) { state.expanded.add(folder); persist('expanded', Array.from(state.expanded)); }
      showView('workflows');
      renderWorkflows();
      var row = $('apps').querySelector('tr.detail[data-folder="' + folder + '"]');
      if (row) { row.classList.add('open'); row.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'center' }); }
    });
    bindFilter('fiFolder', function(){ state.filters.interventions.folder = $('fiFolder').value; }, renderInterventions);
    bindFilter('fiCompany', function(){ state.filters.interventions.company = $('fiCompany').value; }, renderInterventions);
    bindFilter('fiIssue', function(){ state.filters.interventions.issue = $('fiIssue').value; }, renderInterventions);
    bindFilter('fiStage', function(){ state.filters.interventions.stage = $('fiStage').value; }, renderInterventions);
    bindClear('fiClear', function(){ state.filters.interventions = {folder:'',company:'',issue:'',stage:''}; ['fiFolder','fiCompany','fiIssue','fiStage'].forEach(function(id){ if($(id)) $(id).value=''; }); }, renderInterventions);

    // timeline tabs + filters
    if ($('tlTabs')) $('tlTabs').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-tl]'); if (!b) return;
      state.tlFilter = b.dataset.tl; persist('tl', state.tlFilter);
      Array.prototype.forEach.call(document.querySelectorAll('#tlTabs .tab'), function (t) {
        var active = t.dataset.tl === state.tlFilter;
        t.classList.toggle('active', active);
        t.setAttribute('aria-selected', String(active));
      });
      renderTimeline();
    });
    bindFilter('ftDate', function(){ state.filters.timeline.date = $('ftDate').value; }, renderTimeline);
    bindFilter('ftLabel', function(){ state.filters.timeline.label = $('ftLabel').value; }, renderTimeline);
    bindFilter('ftDetail', function(){ state.filters.timeline.detail = $('ftDetail').value; }, renderTimeline);
    bindFilter('ftStatus', function(){ state.filters.timeline.status = $('ftStatus').value; }, renderTimeline);
    bindClear('ftClear', function(){ state.filters.timeline = {date:'',label:'',detail:'',status:''}; ['ftDate','ftLabel','ftDetail','ftStatus'].forEach(function(id){ if($(id)) $(id).value=''; }); }, renderTimeline);

    // docslib filters
    bindFilter('frName', function(){ state.filters.renderHistory.name = $('frName').value; }, renderDocslib);
    bindFilter('frDate', function(){ state.filters.renderHistory.date = $('frDate').value; }, renderDocslib);
    bindFilter('frFile', function(){ state.filters.renderHistory.file = $('frFile').value; }, renderDocslib);
    bindClear('frClear', function(){ state.filters.renderHistory = {name:'',date:'',file:''}; ['frName','frDate','frFile'].forEach(function(id){ if($(id)) $(id).value=''; }); }, renderDocslib);
    bindFilter('fdRole', function(){ state.filters.docslibCv.role = $('fdRole').value; }, renderDocslib);
    bindFilter('fdSource', function(){ state.filters.docslibCv.source = $('fdSource').value; }, renderDocslib);
    bindFilter('fdPdf', function(){ state.filters.docslibCv.pdf = $('fdPdf').value; }, renderDocslib);
    bindFilter('fdDate', function(){ state.filters.docslibCv.date = $('fdDate').value; }, renderDocslib);
    bindClear('fdClear', function(){ state.filters.docslibCv = {role:'',source:'',pdf:'',date:''}; ['fdRole','fdSource','fdPdf','fdDate'].forEach(function(id){ if($(id)) $(id).value=''; }); }, renderDocslib);

    // guardrails filters
    bindFilter('fgId', function(){ state.filters.guardrules.id = $('fgId').value; }, renderGuardrails);
    bindFilter('fgRule', function(){ state.filters.guardrules.rule = $('fgRule').value; }, renderGuardrails);
    bindFilter('fgStatus', function(){ state.filters.guardrules.status = $('fgStatus').value; }, renderGuardrails);
    bindClear('fgClear', function(){ state.filters.guardrules = {id:'',rule:'',status:''}; ['fgId','fgRule','fgStatus'].forEach(function(id){ if($(id)) $(id).value=''; }); }, renderGuardrails);

    // prefs
    if ($('simToggle')) $('simToggle').addEventListener('change', function (e) {
      state.prefs.simulate = e.target.checked; persist('prefs', state.prefs);
      document.body.classList.toggle('sim', state.prefs.simulate);
      $('simBanner').classList.toggle('hidden', !state.prefs.simulate);
      if (state.prefs.simulate) startSim(); else stopSim();
    });
    if ($('pauseBtn')) $('pauseBtn').addEventListener('click', function () {
      state.prefs.live = !state.prefs.live; persist('prefs', state.prefs);
      $('pauseBtn').textContent = state.prefs.live ? 'Pause live' : 'Resume live';
      setStatus(state.prefs.live ? 'live' : 'paused', state.prefs.live);
      if (state.prefs.live) renderAll();
    });

    // console controls
    if ($('consoleClear')) $('consoleClear').addEventListener('click', function () { var c = $('console'); if (c) c.innerHTML = ''; });
  }

  function toggleDetail(folder) {
    if (state.expanded.has(folder)) state.expanded.delete(folder); else state.expanded.add(folder);
    persist('expanded', Array.from(state.expanded));
    var button = Array.prototype.find.call($('apps').querySelectorAll('button[data-expand]'), function (item) { return item.dataset.expand === folder; });
    if (!button) return;
    var expanded = state.expanded.has(folder);
    button.setAttribute('aria-expanded', String(expanded));
    button.setAttribute('aria-label', (expanded ? 'Hide details for ' : 'Show details for ')
      + button.closest('tr').cells[2].textContent + ' - ' + button.closest('tr').cells[3].textContent);
    var detail = document.getElementById(button.getAttribute('aria-controls'));
    if (detail) detail.classList.toggle('open', expanded);
  }

  // ---------- SSE ----------
  function connectData() {
    var es = new EventSource('/events');
    es.addEventListener('data', function (ev) {
      try { state.data = JSON.parse(ev.data); } catch (e) { return; }
      $('ts').textContent = relTime(state.data.generatedAt);
      setStatus('live', true);
      if (state.prefs.live) renderAll();
    });
    es.onopen = function () { setStatus('live', true); };
    es.onerror = function () { setStatus('reconnecting', false); };
  }

  function connectLogs() {
    var es = new EventSource('/logs');
    es.addEventListener('log', function (ev) {
      try { var j = JSON.parse(ev.data); appendLogs(j.lines || []); } catch (e) { /* ignore */ }
    });
    es.addEventListener('status', function (ev) {
      try {
        var j = JSON.parse(ev.data);
        $('consoleStatus').textContent = j.state === 'no-source' ? 'no live source (.memory/live.log not found)' : j.state;
      } catch (e) { /* ignore */ }
    });
    es.onerror = function () { $('consoleStatus').textContent = 'log stream reconnecting\u2026'; };
  }

  function loadOnce() {
    fetch('/api/data').then(function (r) { return r.json(); }).then(function (d) { state.data = d; $('ts').textContent = relTime(d.generatedAt); renderAll(); }).catch(function () { /* SSE will retry */ });
  }

  function setStatus(text, live) {
    var el = $('status'); if (el) el.textContent = text;
    var pulse = $('pulse'); if (pulse) pulse.classList.toggle('off', !live);
  }

  // ---------- init ----------
  function init() {
    // restore prefs into UI
    if ($('simToggle')) $('simToggle').checked = !!state.prefs.simulate;
    document.body.classList.toggle('sim', !!state.prefs.simulate);
    if ($('simBanner')) $('simBanner').classList.toggle('hidden', !state.prefs.simulate);
    if ($('pauseBtn')) $('pauseBtn').textContent = state.prefs.live ? 'Pause live' : 'Resume live';
    // restore workflows filters
    if ($('fCompany')) $('fCompany').value = state.filters.company || '';
    if ($('fRole')) $('fRole').value = state.filters.role || '';
    if ($('fDate')) $('fDate').value = state.filters.date || '';
    if ($('fStage')) $('fStage').value = state.filters.stage || '';
    if ($('fStatus')) $('fStatus').value = state.filters.status || '';
    // restore other filters
    var sets = [
      ['agents',['persona','status','date'],['faPersona','faStatus','faDate']],
      ['agentRuns',['date','task','status'],['farDate','farTask','farStatus']],
      ['interventions',['folder','company','issue','stage'],['fiFolder','fiCompany','fiIssue','fiStage']],
      ['interventions',['folder','company','issue','stage'],['fiFolder','fiCompany','fiIssue','fiStage']],
      ['timeline',['date','label','detail','status'],['ftDate','ftLabel','ftDetail','ftStatus']],
      ['renderHistory',['name','date','file'],['frName','frDate','frFile']],
      ['docslibCv',['role','source','pdf','date'],['fdRole','fdSource','fdPdf','fdDate']],
      ['guardrules',['id','rule','status'],['fgId','fgRule','fgStatus']],
    ];
    sets.forEach(function (sdef) {
      var key = sdef[0], keys = sdef[1], ids = sdef[2];
      var f = state.filters[key] || {};
      ids.forEach(function (id, idx) { if ($(id)) $(id).value = f[keys[idx]] || ''; });
    });
    // restore timeline tab
    Array.prototype.forEach.call(document.querySelectorAll('#tlTabs .tab'), function (t) {
      var active = t.dataset.tl === state.tlFilter;
      t.classList.toggle('active', active);
      t.setAttribute('aria-selected', String(active));
    });
    wire();
    showView(state.view);
    loadOnce();
    connectData();
    connectLogs();
    if (state.prefs.simulate) startSim();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();






































