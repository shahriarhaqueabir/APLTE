#!/usr/bin/env node
import { readFileSync } from 'node:fs';

const lock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'));
const targets = [];

for (const [path, meta] of Object.entries(lock.packages ?? {})) {
  if (!path.includes('node_modules/')) continue;
  if (!meta.version) continue;
  const name = path.slice(path.lastIndexOf('node_modules/') + 'node_modules/'.length);
  targets.push({ name, version: meta.version });
}

if (targets.length === 0) {
  console.error('osv-gate: no packages found in lockfile');
  process.exit(1);
}

const findings = [];

for (const { name, version } of targets) {
  const res = await fetch('https://api.osv.dev/v1/query', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ package: { name, ecosystem: 'npm' }, version }),
  });
  if (!res.ok) {
    console.error(`osv-gate: query failed for ${name}@${version}: HTTP ${res.status}`);
    process.exit(1);
  }
  const body = await res.json();
  for (const v of body.vulns ?? []) {
    findings.push({ name, version, id: v.id, summary: v.summary ?? '' });
  }
  console.log(`ok  ${name}@${version}`);
}

if (findings.length > 0) {
  console.error('\nosv-gate: FAILED');
  for (const f of findings) console.error(`  ${f.id}  ${f.name}@${f.version}  ${f.summary}`);
  process.exit(1);
}

console.log(`\nosv-gate: PASSED (${targets.length} packages, 0 advisories)`);
