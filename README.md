# jobbot

> **Local-first assistant for preparing and submitting job applications on LinkedIn
> Easy Apply.** Researches the vacancy, tailors a CV and cover letter, enforces a
> hard preparation gate, and drives the browser fill flow — while **never
> uploading a file and never clicking Submit.**

[![CI](https://github.com/shahriarhaqueabir/jobbot/actions/workflows/ci.yml/badge.svg)](https://github.com/shahriarhaqueabir/jobbot/actions/workflows/ci.yml)
[![Node.js 26.x](https://img.shields.io/badge/node-26.x-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![Tests](https://img.shields.io/badge/tests-145%20passing-brightgreen)](#testing)
[![OSV](https://img.shields.io/badge/osv-0%20advisories-brightgreen)](#testing)
[![License](https://img.shields.io/badge/license-private-lightgrey)](#license)

---

## 1. The story (why this exists)

Most "auto-apply" tools click Submit for you. That is the one action that
cannot be undone, and automating it is how people get banned, send the wrong CV,
or apply to 200 jobs with a typo. jobbot refuses to do it. It automates the
_tiring_ 90% (scanning forms, matching answers, filling fields, drafting
documents) and keeps the _consequential_ 10% (file uploads, final submission)
in human hands. Every safety rule is enforced in code, not in a README.

The goal was never "apply to 1000 jobs." The goal was: **make applying to one
job take 5 minutes instead of 45, without ever losing control of the outcome.**

---

## 2. The feedback loop that built it (zero → finished)

This is the loop that took the project from nothing to shipped. Re-run it in
this order when recreating or extending.

```
  1. SCAN       read the page, extract fields (no writes)
  2. PLAN       match fields to answers, score confidence, list unknowns
  3. REVIEW     human reads the plan; nothing is filled yet
  4. FILL       fill one page, read back values, assert match
  5. ADVANCE    click "Next" only — never Submit, never upload
  6. AUDIT      append to applied.jsonl + audit.jsonl (append-only truth)
  7. GATE       block the next application until prep is complete + hash matches
  8. RENDER     markdown → PDF + DOCX, locked style tokens
  9. VERIFY     PDF → PNG per page, inspect every page by eye
 10. REPEAT     only after visual verify passes
```

The loop's secret: **every step is reversible until step 5, and step 5 is
reversible until step 6.** Nothing becomes "real" until it is audited. That is
why there is no "undo apply" command — the audit log _is_ the undo history.

The same loop applies to the document pipeline (intake → research → draft →
check-docs → render → verify). Drafts are hash-bound: editing a draft
invalidates its review. You cannot accidentally submit a stale CV.

---

## 3. Good choices (and why they were good)

1. **Safety as code, not docs.** `src/fill/guard.js` refuses to click Submit.
   `src/preparation/gate.js` blocks applications. These are tested, not
   described. Docs rot; tests don't.
2. **Append-only audit truth.** `applied.jsonl` and `audit.jsonl` are the source
   of truth. Status, cap, and history are derived from them. No second database
   to drift.
3. **Hash-bound review.** A document is "reviewed" only when its recorded hash
   matches the current file. Edit the draft → review resets. This single rule
   killed an entire class of "I edited it after approving" bugs.
4. **Path confinement.** Manifest document paths are resolved inside the
   application folder. A traversal attempt returns null and fails the check.
   Cheap, decisive, testable.
5. **Ephemeral browser profile.** Every `jobbot browser` run gets a fresh
   profile under the OS temp dir. Re-login each time. No stale cookies, no
   cross-session leakage, no "why is my LinkedIn in German today" surprises.
6. **Locked style tokens.** Arial 9.5pt/10.5pt, 1.4 line height, 15mm/0.79in
   margins, black text only, bullet U+25CF, A4. Content lives in plain
   Markdown. Layout never leaks into content. Changing a font means changing
   one file, not 40 documents.
7. **Separation of personal vs. public.** Two trees: `jobbot/` (public, clean
   history) and `jobbot-private/` (personal data, not git-tracked). The
   `.gitignore` is the enforcement mechanism, not discipline.
8. **Split the browser smoke test out of `npm test`.** `npm test` stays fast
   and portable (145 tests, no Chrome required); `npm run test:browser` is
   opt-in.
9. **OSV + gitleaks in CI.** Supply-chain and secret scanning run on every
   push. Caught a stray `eslint` devDependency with a vulnerable `minimatch`
   that `npm audit` flagged.
10. **Traceability rule for personas.** Every persona appends to
    `persona-runs.jsonl` and `live.log`. The dashboard's agent monitor and the
    audit trail come for free.

---

## 4. The playbook — recreate this from zero

Follow these steps in order. Do not skip. Each one closes a failure mode.

### Phase 0 — Scope (1 hour)

1. Write down the one sentence: _"Automate the tedious part, keep the
   consequential part human."_
2. List the hard boundaries: never upload, never submit, daily cap, path
   confinement, hash-bound review. These become tests before they become code.

### Phase 1 — Skeleton (half day)

3. `npm init`, Node 26, ESM (`"type": "module"`).
4. Create `src/cli.js` with a `switch (command)` dispatcher and a `usage()`.
5. Add `.gitignore` _first_, before any data file exists. Include: `node_modules/`,
   `CVs/`, `cv-library/`, `data/profile.json`, `data/answers.json`,
   `data/audit.jsonl`, `data/applied.jsonl`, `data/out/`, `.memory/`,
   `browser-profile/`, `.env*`.
6. Add `data/examples/profile.example.json` and `answers.example.json` so the
   repo is runnable by a stranger.

### Phase 2 — Safety core (1 day)

7. Implement `src/fill/guard.js`: `PLAN_TTL_MS`, terminal-button block,
   `assertSafeArgs`. Write tests first (red-green).
8. Implement `src/preparation/gate.js`: `resolveManifestPath`,
   `assertManifestPresent`, `assertPreparationComplete`, `validateManifest`.
   Test every failure branch.
9. Implement `src/fill/cap.js`: `DAILY_CAP` (configurable), `assertUnderCap`,
   `countApplicationsOn`, `localDateKey`. Make the cap read from
   `data/preferences.json` + `JOBBOT_DAILY_CAP` env.
10. Add `src/workflow/machine.js`: hash-bound review, step order, approvals.

### Phase 3 — Browser layer (1 day)

11. `src/browser/driver.js`: Chrome discovery, version matching, preflight.
12. `src/browser/launch.js`: `launchArgs`, `assertSafeArgs`, `waitForDevTools`,
    `launchBrowser` with DevTools reuse. Ephemeral profile per run.
13. `src/browser/open.js`, `scan`, `plan`, `execute`: scan → plan → fill one
    page → click Next only. Read back every value.
14. `src/scan/challenge.js`: detect CAPTCHA/challenge before acting.

### Phase 4 — Document pipeline (2 days)

15. `src/render/style.js`: locked style tokens. `cv.js`, `letter.js`, `pdf.js`,
    `docx.js`, `md.js`, `manifest.js`.
16. `jobbot render` command: markdown → PDF + DOCX.
17. `jobbot verify`: PDF → PNG per page (`pdftoppm`). Inspect by eye.
18. Intake + workflow state machine + approve/advance commands.

### Phase 5 — Dashboard (2 days)

19. `tools/dashboard/`: Express-less Node HTTP server, SSE streams (data +
    live log), actions endpoint, scaffold lifecycle.
20. `gatherData`, `performAction`, path confinement, CSRF guard.

### Phase 6 — Personas & memory (1 day)

21. Persona markdown files with traceability rules (append to
    `persona-runs.jsonl` + `live.log`).
22. Memory pipeline: global / project / learning stores.

### Phase 7 — Tests & CI (1 day)

23. Node built-in test runner. One test file per module. 145+ tests.
24. Split browser smoke test into `npm run test:browser`.
25. GitHub Actions: `npm ci` → `npm test` → `npm run osv`.
26. `.gitleaks.toml` for secret scanning.

### Phase 8 — Ship (half day)

27. OSV gate clean. `npm audit` clean.
28. README with badges, Mermaid diagram, quick start, commands, safety,
    testing, contributing, changelog, user guide.
29. Push only the clean branch. Keep personal data in a separate,
    non-git-tracked tree.

---

## 5. Mistakes to avoid (learned the hard way)

- **Never let layout leak into content.** Spaces for alignment, `---` dividers,
  HTML in Markdown — all caused rendering bugs. Use CSS flex/two-column in the
  template. Content is plain Markdown only.
- **Never persist the browser profile.** Stale sessions and cookie leakage.
  Ephemeral per run, re-login each time.
- **Never trust mtime on Windows.** Two files written in the same millisecond
  compare equal. Add a path-based tiebreaker.
- **Never call `server.close()` and expect pending sockets to die.** Call
  `closeAllConnections()` + destroy tracked sockets first.
- **Never commit `data/scaffolding/` versions.** They contain copies of your
  AGENTS.md and persona files, which may include personal paths.
- **Never push a branch that ever contained personal data**, even if the files
  were later deleted. The blobs live in history. Squash onto a clean base.
- **Never run `npm test` with the browser smoke test in the default path.**
  It needs Chrome and turns a 3-second suite into 11 seconds of flakiness.
- **Never leave `eslint` as a devDependency if you don't lint.** It pulled a
  vulnerable `minimatch` and a Dependabot alert for zero benefit.
- **Never skip the visual verify step.** `pdftoppm` + eye inspection catches
  overflow, clipping, and page-count regressions that unit tests miss.
- **Never declare success without running the verification command.** Show the
  output.

---

## 6. Stack

- **Runtime:** Node.js 26.x (ESM)
- **Browser automation:** Selenium WebDriver 4.52.0 + Chrome (no Playwright —
  excluded until explicitly re-enabled)
- **Rendering:** Chrome (PDF) + `docx` (DOCX)
- **PDF verification:** Poppler (`pdftoppm`)
- **Testing:** Node built-in test runner
- **Security:** OSV gate, gitleaks config, `ignore-scripts=true`
- **CI:** GitHub Actions (ubuntu-latest, Node 26)

## 7. Quick start

```bash
npm ci
cp data/examples/profile.example.json data/profile.json
cp data/examples/answers.example.json data/answers.json
npm test
npm run dashboard
npm run render -- <input.md> [output-dir] [--lang de|en] [--title "Title"]
```

## 8. Testing

```bash
npm test             # 145 tests, no Chrome required
npm run test:browser # browser smoke test (requires Chrome)
npm run osv          # dependency vulnerability gate
```

See [docs/TEST_PLAN.md](docs/TEST_PLAN.md).

## 9. Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Changes to `src/fill/guard.js` or
`src/preparation/gate.js` require explicit review.

## 10. Further reading

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — component map and data flow
- [docs/USER_GUIDE.md](docs/USER_GUIDE.md) — end-user walkthrough
- [docs/CV_COVER_LETTER_GUIDELINES.md](docs/CV_COVER_LETTER_GUIDELINES.md) —
  document writing standard
- [CHANGELOG.md](CHANGELOG.md)

## License

Private project.
