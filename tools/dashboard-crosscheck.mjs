import { gatherData } from './dashboard/data.js';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const d = gatherData();
let ok = true;
const mismatches = [];
function check(cond, msg) { if (!cond) { ok = false; console.error('FAIL:', msg); } else console.log('OK:', msg); }

// 1. apps count vs directories
const dirs = fs.readdirSync('data/out/easy-apply', { withFileTypes: true }).filter(x=>x.isDirectory()).length;
check(d.applications.length === dirs, `apps count ${d.applications.length} === dirs ${dirs}`);

// 2. each app manifest matches
for (const a of d.applications) {
  const m = JSON.parse(fs.readFileSync(`data/out/easy-apply/${a.folder}/manifest.json`, 'utf8'));
  check(a.company === (m.job?.company||'?'), `${a.folder} company`);
  check(a.status === (m.application?.status||'?'), `${a.folder} status`);
  check(a.userReviewed === !!m.application?.userReviewed, `${a.folder} userReviewed`);
  // artifact hashes: dashboard must accurately report the manifest hash and the actual file hash
  for (const art of a.artifacts) {
    const manifestDoc = (m.documents || []).find(x => x.name === art.name);
    check(art.hash === (manifestDoc?.hash || null), `${a.folder} ${art.name} reports manifest hash`);
    if (art.path && art.exists) {
      const full = path.join('data/out/easy-apply', a.folder, art.path);
      const h = crypto.createHash('sha256').update(fs.readFileSync(full)).digest('hex');
      check(art.actualHash === h, `${a.folder} ${art.name} actualHash accurate`);
      check(art.hashMatches === (art.hash === h), `${a.folder} ${art.name} hashMatches accurate`);
      if (art.hash && art.hash !== h) mismatches.push(`${a.folder}/${art.name}`);
    }
  }
  // hasCv/hasCl
  const cvDocs = (m.documents||[]).filter(x=>x.type==='cv');
  const clDocs = (m.documents||[]).filter(x=>x.type==='cover-letter');
  const cvExists = cvDocs.some(x=>fs.existsSync(path.join('data/out/easy-apply', a.folder, x.path)));
  const clExists = clDocs.some(x=>fs.existsSync(path.join('data/out/easy-apply', a.folder, x.path)));
  check(a.hasCv === cvExists, `${a.folder} hasCv`);
  check(a.hasCl === clExists, `${a.folder} hasCl`);
}

// 3. persona counts vs jsonl
const lines = fs.readFileSync('.memory/persona-runs.jsonl','utf8').trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
check(d.totals.runs === lines.length, `runs ${d.totals.runs} === ${lines.length}`);
const counts = {};
for (const r of lines) counts[r.persona] = (counts[r.persona]||0)+1;
for (const [k,v] of Object.entries(counts)) check(d.personaCounts[k] === v, `persona count ${k}`);

// 4. cv library
const cvDirs = fs.readdirSync('cv-library', { withFileTypes: true }).filter(x=>x.isDirectory()).map(x=>x.name);
check(d.cvLibrary.length === cvDirs.length, `cv lib count`);
for (const c of d.cvLibrary) {
  check(cvDirs.includes(c.role), `cv role ${c.role} exists`);
  const src = fs.existsSync(`cv-library/${c.role}/source/cv.md`) ? `cv-library/${c.role}/source/cv.md` : `cv-library/${c.role}/cv.md`;
  if (fs.existsSync(src)) {
    const w = fs.readFileSync(src,'utf8').split(/\s+/).length;
    check(c.words === w, `${c.role} words ${c.words}===${w}`);
  }
}

// 5. interventions sanity: count should equal issues sum
const issueSum = d.applications.reduce((s,a)=>s+a.issues.length,0) + (d.global.planUnknowns? d.global.planUnknowns : 0);
check(d.interventions.length === issueSum, `interventions ${d.interventions.length} === issues+unknowns ${issueSum}`);

// 6. timeline sorted desc
let sorted = true;
for (let i=1;i<d.timeline.length;i++) if (new Date(d.timeline[i].time) > new Date(d.timeline[i-1].time)) { sorted=false; break; }
check(sorted, 'timeline sorted desc');

console.log('\nCROSS-CHECK', ok ? 'PASSED' : 'FAILED');
if (mismatches.length) {
  console.log(`\nDATA INTEGRITY: ${mismatches.length} artifact(s) whose on-disk hash differs from the manifest hash:`);
  for (const x of mismatches) console.log('  - ' + x);
  console.log('(The dashboard reports these accurately as "hash mismatch". Manifests may need regeneration.)');
}
process.exit(ok?0:1);
