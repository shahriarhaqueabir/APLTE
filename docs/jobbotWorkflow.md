# jobbot — Workflows

> Companion to [README.md](../README.md) and [ARCHITECTURE.md](ARCHITECTURE.md).
> This document is the operational playbook: **what to do, in what order, and where the
> safety gates are.** Code enforces the gates; this doc explains them.

---

## 0. Philosophy

- **Automate the tedious 90%, keep the consequential 10% human.** Never upload a file, never click Submit.
- **Safety as code, not docs.** `guard.js` refuses terminal buttons; `gate.js` blocks applications; both are tested.
- **Append-only truth.** `applied.jsonl` + `audit.jsonl` are the source of truth. Status, cap, and history are derived.
- **Hash-bound review.** A draft is "reviewed" only when its recorded hash matches the current file. Edit → review resets.
- **Path confinement.** Manifest document paths resolve inside the application folder; traversal returns null.
- **Ephemeral browser profile.** Fresh profile per run; re-login every time.

---

## 1. The core feedback loop (10 steps)

Re-run in this order. Every step closes a failure mode.

```
 1. SCAN      read the page, extract fields (no writes)
 2. PLAN      match fields to answers, score confidence, list unknowns
 3. REVIEW    human reads the plan; nothing is filled yet
 4. FILL      fill one page, read back values, assert match
 5. ADVANCE   click "Next" only — never Submit, never upload
 6. AUDIT     append to applied.jsonl + audit.jsonl (append-only truth)
 7. GATE      block the next application until prep is complete + hash matches
 8. RENDER    markdown → PDF + DOCX, locked style tokens
 9. VERIFY    PDF → PNG per page, inspect every page by eye
10. REPEAT    only after visual verify passes
```

Nothing becomes "real" until it is audited. The audit log **is** the undo history.

---

## 2. Per-application workflow state machine

Each application folder (`data/out/easy-apply/<folder>/manifest.json`) carries a `workflow`:

| Step | Label | Meaning |
|---|---|---|
| `research` | Research & Report | Company/role research + job description captured |
| `draft` | Draft CV/CL | Tailored CV and cover letter written |
| `checks` | Automated Checks | check-docs + ATS + fact-check pass |
| `render` | Render PDFs | PDF + DOCX produced, visually verified |
| `apply` | Apply | Application submitted (human clicks Submit) |

Status values: `pending_review` → `approved` → `done` (or `blocked`).

Rules (enforced by `src/workflow/machine.js`):
- A step can be approved only when it is the **current** step and `pending_review`.
- Advance to next step only when current is `approved`.
- `apply` is the last step; `complete()` marks it `done`.
- Hash-bound review: editing a draft invalidates `reviewedHashes`.

CLI:
```
jobbot workflow <folder>          # show current step/status/approvals
jobbot approve <folder> <step>     # approve step, auto-advance if allowed
```
Dashboard: "Approve & advance" button (shown only when `pending_review`), reuses the same gates.

---

## 3. Browser automation workflow (per page)

```
jobbot browser   → launch Chrome (ephemeral profile, port 9222)
jobbot check     → prove Selenium attach (navigator.webdriver === false)
jobbot open      → click Easy Apply, wait for modal
jobbot scan      → read-only field dump → data/scan.json
jobbot plan      → build fill plan → data/pending-plan.json (dry run)
jobbot apply     → fill one page, verify readback, click Next only
```

Safety during fill (`src/fill/execute.js` + `guard.js`):
- Refuses file inputs and Submit/Send buttons (terminal-button block).
- Plan TTL (5 min) + page-hash unchanged assertion before filling.
- Readback verification for text/select; mismatch throws (except dates → warn).
- CAPTCHA/challenge detection halts the run.
- Appends `[FILL]` lines to `.memory/live.log` and structured events to `.memory/browser-events.jsonl`.

After apply, run `jobbot status` to check daily cap + recent audit entries.

---

## 4. Document pipeline workflow (per application)

```
intake  →  research  →  draft  →  checks  →  render  →  verify  →  apply
```

### 4.1 Intake
```
jobbot intake <job-url> [--company "Co"] [--role "Role"]
```
Creates `data/out/easy-apply/<date-slug>/` with `research/` dir and a manifest.

### 4.2 Research (persona: company-researcher)
- Write `research/company-research.md` and `research/job-description.md`.
- Approve: `jobbot approve <folder> research`.

### 4.3 Draft (personas: cv-writer, cover-letter-writer, ats-optimizer)
- Write `cv/cv.md` and `cover-letter/cover-letter.md` (or under `source/`).
- Tailor to the vacancy; ATS-optimize keywords.
- Approve: `jobbot approve <folder> draft`.

### 4.4 Checks (personas: recruiter-dach, fact-checker)
- `jobbot check-docs` validates document structure.
- Recruiter review + fact-check of claims.
- Approve: `jobbot approve <folder> checks`.

### 4.5 Render
```
jobbot render <input.md> [output-dir] [--lang de|en] [--title "Title"]
```
Markdown → PDF + DOCX + HTML, locked style tokens (Arial 9.5/10.5pt, 1.4 lh, 15mm/0.79in margins, black text, bullet U+25CF, A4).
Dashboard: "Force re-render" button regenerates and refreshes hashes.

### 4.6 Verify (persona: visual-qa)
```
jobbot verify <input.pdf> [output-dir]
```
PDF → per-page PNG via `pdftoppm`. Inspect every page by eye (overflow, clipping, page count).
Approve: `jobbot approve <folder> render`.

### 4.7 Apply
Human clicks Submit on LinkedIn. Then:
```
jobbot approve <folder> apply   # marks workflow done
```
Dashboard: "Mark applied" button (also sets reviewed + workflow done).

---

## 5. Preparation gate (before any apply)

`src/preparation/gate.js` blocks applications until:
- All required prep files present (manifest, research, CV, cover letter, rendered PDFs).
- `masterCvReviewed === true`.
- User reviewed documents (`userReviewed === true`, hash matches).
- Path confinement validated.

Dashboard surfaces gate status per application (research ✓, master CV ✓, CV rendered ✓, CL rendered ✓, user reviewed ✓).

---

## 6. Dashboard cockpit workflow

Start: `npm run dashboard` → http://127.0.0.1:8787 (SSE on `/events`, `/logs`, `/browser-events`).

### Views
| View | Purpose |
|---|---|
| Overview | System health, active/completed/failed/interrupted counts, avg processing time, attention count |
| Jobs (Workflows) | Per-app 8-step pipeline (research→cv source→cv rendered→cl source→cl rendered→manifest→reviewed→applied), timestamps, durations, issues |
| Timeline | Persona runs + pipeline stage events (40 most recent), filterable |
| Agents | Per-persona monitor (count, success/fail, avg duration, last task, last 20 runs) |
| Browser Agent | Screenshot + field table + live fill progress feed |
| Action Items | Intervention queue (missing research, unrendered docs, awaiting review, ready to apply, missing files, unresolved plan fields) |
| Documents library | CV library, master CV/CL, render history, artifacts with hash verification |
| Guardrails/Safety | Daily cap (10/day), ToS ack, 11 rules G1–G11, hash mismatches |
| Live Console | SSE stream of `.memory/live.log` |

### Actions (dashboard)
| Action | Effect |
|---|---|
| Mark reviewed | Sets `application.userReviewed = true` |
| Mark master CV reviewed | Sets `preparation.masterCvReviewed = true` |
| Force re-render | Re-renders all source MDs, refreshes hashes, cleans verify PNGs |
| Mark applied | Sets status `applied`, reviewed, workflow → apply/done |
| Approve & advance | Reuses workflow machine gates (only when `pending_review`) |
| Retry run / Skip stage | Simulated only (no file changes) |

All actions append to `data/audit.jsonl` (source: `dashboard`).

### Live streams
- `/events` — data payload (1s cache, file-watch triggered).
- `/logs` — tails `.memory/live.log` (redacted).
- `/browser-events` — tails `.memory/browser-events.jsonl` (structured fill events).

---

## 7. Persona orchestration workflow

Personas in `personas/`: cv-writer, cover-letter-writer, recruiter-dach, visual-qa, company-researcher, ats-optimizer, fact-checker.

Protocol:
1. Identify task type → select persona.
2. Dispatch as subagent with persona text + task context.
3. Run independent personas in parallel; sequence dependent ones (researcher → writer → recruiter → visual-qa).
4. Main thread orchestrates, integrates, runs build commands, declares completion only after verification.
5. **Traceability:** every run appends one JSONL line to `.memory/persona-runs.jsonl` (timestamp, persona, task, outputs[], status). Read first, never overwrite.

---

## 8. Safety & guardrails workflow

| ID | Rule | Status |
|---|---|---|
| G1 | File inputs never written | enforced |
| G2 | Submit/Send never clicked (allowlist) | enforced |
| G3 | Plan hash + 5-min expiry | enforced |
| G4 | CAPTCHA/checkpoint halts run | enforced |
| G5 | 10 applications/day cap | self-discipline |
| G6 | Audit log (timestamp, job, field, value hash, source) | enforced |
| G7 | Sensitive answers stored as hashes only | enforced |
| G8 | No fabrication | enforced |
| G9 | Preparation gate before apply | enforced |
| G10 | Frozen layout (template + style.js) | enforced |
| G11 | LinkedIn ToS acknowledgement | acknowledged |

Daily cap: configurable via `data/preferences.json` + `JOBBOT_DAILY_CAP` env. Counted from `applied.jsonl`/`audit.jsonl` by date.

Supply chain: OSV gate (`npm run osv`), gitleaks, `ignore-scripts=true`. CI: GitHub Actions (ubuntu, Node 26) runs `npm ci` → `npm test` → `npm run osv`.

---

## 9. Daily operating routine

1. `jobbot browser` → log into LinkedIn (fresh profile).
2. `jobbot check` → confirm attach.
3. For each target job:
   - `jobbot open` → `jobbot scan` → `jobbot plan` → review plan.
   - `jobbot apply` (one page) → repeat scan/plan/apply per page.
   - `jobbot status` → check cap.
4. For each application folder: research → draft → checks → render → verify → approve each step.
5. `npm run dashboard` → monitor pipeline, agents, interventions.
6. After every render: `jobbot verify` + eye-inspect PNGs before declaring done.

---

## 10. Key files & data flow

```
data/scan.json              ← last scan
data/pending-plan.json      ← last plan
data/applied.jsonl         ← append-only application log
data/audit.jsonl           ← append-only audit trail
data/out/easy-apply/<f>/    ← per-application folder (manifest + docs + research)
data/out/rendered/          ← render history
.memory/live.log            ← live agent log (streamed)
.memory/browser-events.jsonl← structured fill events (streamed)
.memory/persona-runs.jsonl ← persona traceability
CVs/MASTER_CV.md           ← master CV
CVs/MASTER_COVER_LETTER.md ← master cover letter
cv-library/<role>/          ← reusable CV variants
templates/pdf-template.html ← frozen layout template
src/render/style.js        ← locked style tokens
```

---

## 11. Commands quick reference

| Command | Description |
|---|---|
| `jobbot browser` | Launch Chrome (ephemeral profile) |
| `jobbot check` | Prove Selenium attach works |
| `jobbot open` | Click Easy Apply, wait for modal |
| `jobbot scan` | Read-only field dump → `data/scan.json` |
| `jobbot plan` | Build fill plan → `data/pending-plan.json` |
| `jobbot apply` | Fill one page, click Next only |
| `jobbot status` | Daily cap + recent audit entries |
| `jobbot intake <url>` | Create application folder |
| `jobbot workflow <folder>` | Show workflow state |
| `jobbot approve <folder> <step>` | Approve + advance workflow step |
| `jobbot render <md> [out]` | Markdown → PDF + DOCX |
| `jobbot verify <pdf> [out]` | PDF → PNG pages |
| `npm test` | 148 tests, no Chrome |
| `npm run test:browser` | Browser smoke (needs Chrome) |
| `npm run osv` | Dependency vulnerability gate |
| `npm run dashboard` | Control Tower on :8787 |

---

*Generated for jobbot v0.1.0. See [README.md](../README.md) for badges, architecture diagram, and build journal.*