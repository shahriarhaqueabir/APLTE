# Architecture — jobbot

## Overview

jobbot is a local-first, two-pipeline assistant:

1. **Browser fill pipeline** — scans a LinkedIn Easy Apply modal, builds a fill
   plan, fills one page, clicks Next (never Submit).
2. **Document pipeline** — researches a vacancy, drafts a tailored CV and cover
   letter, runs a traceability gate, renders to PDF + DOCX.

Both pipelines share a manifest-based application folder and a workflow state
machine with hash-bound draft review.

## Module map

```
src/
├── cli.js                 # command dispatcher
├── browser/               # Chrome launch/attach/open (Selenium)
├── scan/                  # extract.js (DOM→fields), challenge.js
├── plan/                  # build.js, match.js (answer bank matching)
├── fill/                  # execute.js, guard.js, cap.js, audit.js
├── preparation/           # gate.js (assertPreparationComplete), check-docs.js
├── workflow/              # machine.js, states.js (research→draft→checks→render)
├── render/                # cv.js, letter.js, manifest.js, style.js
├── application/           # intake.js, paths.js (named drafts)
├── orchestration/         # application.js (multi-page context, reference)
├── profile/               # load.js, schema.js (profile/answers validation)
├── answers/               # check.js (answers.md validation)
├── status.js, log/applied.js, telemetry/timing.js, util/*
├── runner/                # optional LLM runner (config/resolve/run)
└── scaffolding/           # versioned managed-file lifecycle
```

## Browser fill data flow

1. `jobbot scan` → `extractFields` (DOM → structured field descriptors + page
   hash) → `data/scan.json`.
2. `jobbot plan` → `buildPlan(scan, answers)` → matched fills / unknowns /
   ambiguities + `advanceButton` → `data/pending-plan.json`.
3. `jobbot apply`:
   - Preparation gate (`assertPreparationComplete`).
   - Daily cap check (`assertUnderCap`).
   - Plan freshness (`assertPlanFresh`, 5 min TTL).
   - Re-scan live page + `assertPageUnchanged` (URL/domain/job/modal/stage/
     field keys & types/buttons/page hash).
   - Challenge check (`assertNoChallenge`).
   - `fillPage` → fill each field, readback verify, click advance (guard
     re-checks terminal/advance labels in-browser).
   - Audit + applied logs.

## Document pipeline data flow

1. `jobbot intake <url>` → application folder + named draft placeholders +
   manifest (workflow at `draft`, pending review).
2. Personas research → `research/job-description.md`, `company-research.md`.
3. `jobbot check-docs <folder>` → structure + traceability (numbers/proper
   nouns vs MASTER_CV) + company claims.
4. User reviews drafts → `jobbot approve <folder> draft` (hash-bound).
5. `jobbot render` → PDF + DOCX (Chrome headless), verify PNGs via pdftoppm.

## Safety invariants (code-enforced)

| Invariant | Location |
|---|---|
| No file inputs filled | `fill/guard.js` `assertFillable` |
| No terminal (Submit/Send) buttons clicked | `fill/guard.js` + in-browser regex in `fill/execute.js` |
| Plan TTL (5 min) | `fill/guard.js` `assertPlanFresh` |
| Page unchanged since plan | `fill/guard.js` `assertPageUnchanged` + `util/hash.js` `pageHash` |
| Daily cap (10/day) | `fill/cap.js` `assertUnderCap` |
| Preparation gate | `preparation/gate.js` `assertPreparationComplete` |
| Document path confinement | `preparation/gate.js` `resolveInside` |
| Hash-bound draft review | `workflow/machine.js` `reviewedHashesMatch` |

## Key design notes

- `pageHash` is **structure-only** (excludes values) so mid-run edits don't
  void the plan.
- `answers.json` entries are source-attributed and confidence-tagged; sensitive
  values are hashed in audit logs.
- Rendering never invokes Chrome directly by users; only `jobbot render`.
- Personal data is never committed; paths resolve against the package root.