#!/usr/bin/env node
// src/cli.js — jobbot CLI dispatcher

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DATA = join(ROOT, 'data');

function ensureDataDir() { mkdirSync(DATA, { recursive: true }); }

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function writeJson(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2), 'utf8');
}

function usage() {
  console.log(`jobbot — local LinkedIn Easy Apply assistant

Usage: jobbot <command> [options]

Commands:
  browser    Launch Chrome with the jobbot profile
  check      Prove the Selenium attach works (navigator.webdriver === false)
  open       Click Easy Apply and wait for the modal
  scan       Read-only field dump of the current page (saves data/scan.json)
  plan       Build a fill plan from the last scan (dry run, saves data/pending-plan.json)
  apply      Execute the pending plan (fills one page, clicks Next only)
  status     Daily cap usage + recent audit entries
  intake     Create a new application folder from a job URL
  workflow   Show workflow state for an application folder
  approve    Approve a workflow step: jobbot approve <folder> <step>
  render     Render a markdown file to PDF + DOCX
  verify     Render a PDF to PNG pages for visual inspection (pdftoppm)
  help       Show this help

Safety: the assistant never uploads a file and never clicks Submit.
`);
}

const args = process.argv.slice(2);
const command = args[0] || 'help';

async function main() {
  ensureDataDir();

  switch (command) {
    case 'help':
    case '--help':
    case '-h':
      usage();
      break;

    case 'browser': {
      const { launchBrowser } = await import('./browser/launch.js');
      const { findChrome: fc, preflight } = await import('./browser/driver.js');
      try { preflight({ chromePath: fc() }); } catch (e) { console.error(e.message); process.exitCode = 1; break; }
      const chromePath = fc();
      const profileDir = join(ROOT, 'browser-profile');
      const result = await launchBrowser({ chromePath, profileDir, port: 9222 });
      console.log(JSON.stringify(result, null, 2));
      console.log('Chrome launched. Log into LinkedIn in that window.');
      break;
    }

    case 'check': {
      const { preflight } = await import('./browser/driver.js');
      try { preflight(); } catch (e) { console.error(e.message); process.exitCode = 1; break; }
      const { attach, attachProof, dispose } = await import('./browser/attach.js');
      const driver = await attach({ port: 9222 });
      try {
        const proof = await attachProof(driver);
        console.log(JSON.stringify(proof, null, 2));
        if (proof.webdriver !== false) {
          console.error('WARNING: navigator.webdriver is not false!');
          process.exitCode = 1;
        }
      } finally {
        await dispose(driver);
      }
      break;
    }

    case 'open': {
      const { preflight } = await import('./browser/driver.js');
      try { preflight(); } catch (e) { console.error(e.message); process.exitCode = 1; break; }
      const { attach, dispose } = await import('./browser/attach.js');
      const { openEasyApply } = await import('./browser/open.js');
      const driver = await attach({ port: 9222 });
      try {
        const result = await openEasyApply(driver);
        console.log(JSON.stringify(result, null, 2));
        console.log('Modal opened. Run "jobbot scan" next.');
      } finally {
        await dispose(driver);
      }
      break;
    }

    case 'scan': {
      const { preflight } = await import('./browser/driver.js');
      try { preflight(); } catch (e) { console.error(e.message); process.exitCode = 1; break; }
      const { attach, dispose } = await import('./browser/attach.js');
      const { extractFields } = await import('./scan/extract.js');
      const driver = await attach({ port: 9222 });
      try {
        const scan = await extractFields(driver);
        const scanPath = join(DATA, 'scan.json');
        writeJson(scanPath, scan);
        console.log(JSON.stringify(scan, null, 2));
        console.log(`\nSaved to ${scanPath}`);
      } finally {
        await dispose(driver);
      }
      break;
    }

    case 'plan': {
      const scanPath = join(DATA, 'scan.json');
      if (!existsSync(scanPath)) {
        console.error('No scan found. Run "jobbot scan" first.');
        process.exitCode = 1;
        break;
      }
      const scan = readJson(scanPath);
      const answersPath = join(DATA, 'answers.json');
      if (!existsSync(answersPath)) {
        console.error('No answers.json found. Create data/answers.json first.');
        process.exitCode = 1;
        break;
      }
      const { loadAnswers } = await import('./profile/load.js');
      const answers = loadAnswers(answersPath);
      const { buildPlan, summarisePlan } = await import('./plan/build.js');
      const plan = buildPlan(scan, answers);
      const planPath = join(DATA, 'pending-plan.json');
      writeJson(planPath, plan);
      console.log(summarisePlan(plan));
      console.log(`\nPlan saved to ${planPath}`);
      if (plan.unknowns.length > 0) {
        console.log(`\nWARNING: ${plan.unknowns.length} unknown field(s) need manual answers before applying.`);
        console.log('Batch unknowns:', JSON.stringify(plan.batchUnknowns, null, 2));
      }
      if (plan.ambiguities.length > 0) {
        console.log(`WARNING: ${plan.ambiguities.length} ambiguous field(s) need resolution.`);
      }
      break;
    }

    case 'apply': {
      const planPath = join(DATA, 'pending-plan.json');
      if (!existsSync(planPath)) {
        console.error('No pending plan. Run "jobbot scan" then "jobbot plan" first.');
        process.exitCode = 1;
        break;
      }
      const plan = readJson(planPath);

      // Preparation gate — mandatory and checked before touching the browser.
      const manifestFlag = args.indexOf('--manifest');
      const explicitManifest = manifestFlag >= 0 ? args[manifestFlag + 1] : null;
      const {
        resolveManifestPath,
        assertManifestPresent,
        assertPreparationComplete,
      } = await import('./preparation/gate.js');
      try {
        const manifestPath = assertManifestPresent(
          resolveManifestPath(join(DATA, 'out', 'easy-apply'), explicitManifest)
        );
        const manifest = readJson(manifestPath);
        assertPreparationComplete(manifest, dirname(manifestPath));
        console.log('Preparation gate: PASS');
      } catch (e) {
        console.error(e.message);
        process.exitCode = 1;
        break;
      }

      const { preflight } = await import('./browser/driver.js');
      try { preflight(); } catch (e) { console.error(e.message); process.exitCode = 1; break; }

      const { attach, dispose } = await import('./browser/attach.js');
      const { fillPage } = await import('./fill/execute.js');
      const { assertPlanFresh } = await import('./fill/guard.js');
      const { assertUnderCap } = await import('./fill/cap.js');
      const { createAudit } = await import('./fill/audit.js');
      const { appendApplied } = await import('./log/applied.js');
      const { extractFields } = await import('./scan/extract.js');
      const { assertNoChallenge } = await import('./scan/challenge.js');

      const driver = await attach({ port: 9222 });
      try {
        // Timing tracking
        const { createTimingTracker, TIMING_LABELS } = await import('./telemetry/timing.js');
        const timing = createTimingTracker();
        timing.start(TIMING_LABELS.APPLICATION_TOTAL);

        // 1. Daily cap check
        const auditPath = join(DATA, 'audit.jsonl');
        assertUnderCap(auditPath);

        // 2. Plan freshness
        assertPlanFresh(plan);

        // 3. Re-scan the live page (don't trust stale scan.json)
        timing.start(TIMING_LABELS.DOM_SNAPSHOT);
        const liveSnapshot = await extractFields(driver);
        timing.end(TIMING_LABELS.DOM_SNAPSHOT);

        // 4. Challenge check
        timing.start(TIMING_LABELS.CHALLENGE_CHECK);
        assertNoChallenge({ text: await driver.executeScript('return document.body.innerText || "";'), foundSelectors: [] });
        timing.end(TIMING_LABELS.CHALLENGE_CHECK);

        // 5. Fill + advance
        timing.start(TIMING_LABELS.FORM_FILLING);
        const result = await fillPage(driver, plan, liveSnapshot);
        timing.end(TIMING_LABELS.FORM_FILLING);
        console.log(`Filled ${result.filled.length} field(s).`);
        if (result.nextClicked) {
          console.log('Clicked advance button. Run "jobbot scan" for the next page.');
        }

        // 6. Audit log
        const audit = createAudit(auditPath);
        audit.record({ event: 'application', ts: new Date().toISOString(), job: plan.title, fields: result.filled.length });

        // 7. Applied log (page-level record, including timing)
        const timingSummary = timing.summary();
        appendApplied(join(DATA, 'applied.jsonl'), {
          job: plan.title,
          company: (liveSnapshot.title || '').split('|').pop().trim() || 'unknown',
          platform: 'linkedin-easy-apply',
          status: 'page-filled',
          notes: `Filled ${result.filled.length} field(s), advance=${result.nextClicked}`,
          timing: {
            dom_snapshot_ms: timingSummary.categories.dom_snapshot,
            form_filling_ms: timingSummary.categories.form_filling,
            total_ms: timingSummary.total_ms,
            total_seconds: timingSummary.total_seconds,
          },
        });

        // Print timing summary
        console.log('');
        const { formatTimingSummary } = await import('./telemetry/timing.js');
        console.log(formatTimingSummary(timingSummary));

      } catch (err) {
        console.error(err.message || err);
        process.exitCode = 1;
      } finally {
        await dispose(driver);
      }
      break;
    }

    case 'status': {
      const { buildStatus, formatStatus } = await import('./status.js');
      const appliedPath = join(DATA, 'applied.jsonl');
      const auditPath = join(DATA, 'audit.jsonl');
      const status = buildStatus(appliedPath, auditPath);
      console.log(formatStatus(status));
      break;
    }

    case 'render': {
      const inputPath = args[1];
      const outputDir = args[2] || join(DATA, 'out', 'rendered');
      const langIdx = args.indexOf('--lang');
      const titleIdx = args.indexOf('--title');
      const lang = langIdx >= 0 && args[langIdx + 1] ? args[langIdx + 1] : 'en';
      const title = titleIdx >= 0 && args[titleIdx + 1] ? args[titleIdx + 1] : 'Document';
      if (!inputPath) {
        console.error('Usage: jobbot render <input.md> [output-dir] [--lang de|en] [--title "Title"]');
        process.exitCode = 1;
        break;
      }
      const { renderLetter } = await import('./render/letter.js');
      const { readFileSync } = await import('node:fs');
      const md = readFileSync(inputPath, 'utf8');
      const result = await renderLetter(md, outputDir, { lang, title });
      console.log(JSON.stringify(result, null, 2));
      if (!result.verifyImages || result.verifyImages.length === 0) {
        console.log('\\nVerify: pdftoppm unavailable or produced no PNGs. Install Poppler and run "jobbot verify <pdf>".');
      } else {
        console.log(`\\nVerify: ${result.verifyImages.length} page PNG(s) written. Inspect them before declaring done.`);
      }
      break;
    }

    case 'verify': {
      const pdfPath = args[1];
      const outDir = args[2] || dirname(pdfPath || '.');
      if (!pdfPath) {
        console.error('Usage: jobbot verify <input.pdf> [output-dir]');
        process.exitCode = 1;
        break;
      }
      const prefix = join(outDir, 'verify-page');
      const { execFileSync } = await import('node:child_process');
      const candidates = ['pdftoppm', join(ROOT, 'bin', 'pdftoppm.exe')];
      let ok = false;
      for (const cand of candidates) {
        try {
          execFileSync(cand, ['-png', pdfPath, prefix], { stdio: 'pipe', timeout: 120000 });
          ok = true;
          break;
        } catch (e) { /* try next */ }
      }
      try {
        if (!ok) throw new Error('pdftoppm not found');
        const { readdirSync } = await import('node:fs');
        const images = readdirSync(outDir)
          .filter((f) => /^verify-page.*\.png$/i.test(f))
          .map((f) => join(outDir, f))
          .sort();
        console.log(JSON.stringify({ pdf: pdfPath, images }, null, 2));
        if (images.length === 0) console.error('No PNG pages produced.');
      } catch (e) {
        console.error('pdftoppm failed or not installed. Install Poppler, then retry.');
        console.error(e.message || e);
        process.exitCode = 1;
      }
      break;
    }

    case 'workflow': {
      const folder = args[1];
      if (!folder) { console.error('Usage: jobbot workflow <app-folder>'); process.exitCode = 1; break; }
      const dir = join(DATA, 'out', 'easy-apply', folder);
      const mp = join(dir, 'manifest.json');
      if (!existsSync(mp)) { console.error('No manifest found for ' + folder); process.exitCode = 1; break; }
      const manifest = readJson(mp);
      const { currentStep, currentStatus, STEP_LABELS } = await import('./workflow/machine.js');
      console.log(`Workflow: ${folder}`);
      console.log(`  current step : ${currentStep(manifest)} (${STEP_LABELS[currentStep(manifest)]})`);
      console.log(`  status       : ${currentStatus(manifest)}`);
      console.log(`  approvals    : ${JSON.stringify(manifest.workflow?.approvals || {})}`);
      break;
    }

    case 'approve': {
      const folder = args[1];
      const step = args[2];
      if (!folder || !step) { console.error('Usage: jobbot approve <app-folder> <step>'); process.exitCode = 1; break; }
      const dir = join(DATA, 'out', 'easy-apply', folder);
      const mp = join(dir, 'manifest.json');
      if (!existsSync(mp)) { console.error('No manifest found for ' + folder); process.exitCode = 1; break; }
      const manifest = readJson(mp);
      const { approve, advance, canAdvance, STEP_LABELS, STATUS } = await import('./workflow/machine.js');
      try {
        approve(manifest, step);
        if (canAdvance(manifest)) advance(manifest);
        writeJson(mp, manifest);
        console.log(`Approved '${step}' (${STEP_LABELS[step]}). New step: ${manifest.workflow.step} (${manifest.workflow.status}).`);
      } catch (e) {
        console.error(e.message);
        process.exitCode = 1;
      }
      break;
    }

    case 'intake': {
      const url = args[1];
      if (!url) { console.error('Usage: jobbot intake <job-url> [--company "Co"] [--role "Role"]'); process.exitCode = 1; break; }
      const companyIdx = args.indexOf('--company');
      const roleIdx = args.indexOf('--role');
      const company = companyIdx >= 0 ? args[companyIdx + 1] : 'Unknown';
      const role = roleIdx >= 0 ? args[roleIdx + 1] : 'Role';
      const date = new Date().toISOString().slice(0, 10);
      const slug = (company + '-' + role).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
      const folder = `${date}-${slug}`;
      const dir = join(DATA, 'out', 'easy-apply', folder);
      const { mkdirSync } = await import('node:fs');
      mkdirSync(join(dir, 'research'), { recursive: true });
      const { createManifest } = await import('./render/manifest.js');
      const manifest = createManifest(dir, {
        jobUrl: url,
        company,
        role,
        platform: 'linkedin-easy-apply',
        status: 'prepared',
        masterCvReviewed: false,
        documents: [],
      });
      // Scaffold research files as placeholders for the agent to fill.
      const { writeFileSync } = await import('node:fs');
      writeFileSync(join(dir, 'research', 'job-description.md'), `# Job Description\n\nSource: ${url}\n\n_Paste or scrape the job description here._\n`, 'utf8');
      writeFileSync(join(dir, 'research', 'company-research.md'), `# Company Research\n\n_Pending research._\n`, 'utf8');
      console.log(`Created: ${dir}`);
      console.log(`Folder: ${folder}`);
      console.log(`Manifest: ${join(dir, 'manifest.json')}`);
      console.log('Next: research the company/role, then write research/*.md and the report, then: jobbot approve ' + folder + ' research');
      break;
    }

    case 'segment': {
      const { execFileSync } = await import('node:child_process');
      try {
        execFileSync('node', [join(ROOT, 'tools', 'segment-cv.js')], { stdio: 'inherit', timeout: 30000 });
      } catch (e) {
        console.error('segment failed:', e.message || e);
        process.exitCode = 1;
      }
      break;
    }

    case 'check-docs': {
      const folder = args[1];
      if (!folder) {
        console.error('Usage: jobbot check-docs <app-folder>');
        process.exitCode = 1;
        break;
      }
      const target = resolve(folder);
      const { checkDocs } = await import('./preparation/check-docs.js');
      const result = checkDocs(target);
      console.log(JSON.stringify(result, null, 2));
      if (!result.ok) {
        console.error(`\\ncheck-docs FAILED: ${result.failures.length} issue(s).`);
        process.exitCode = 1;
      } else {
        console.log('\\ncheck-docs PASSED.');
      }
      break;
    }

    default:
      console.error(`Unknown command: ${command}`);
      usage();
      process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exitCode = 1;
});
