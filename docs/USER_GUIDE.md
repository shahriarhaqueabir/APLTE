# jobbot User Guide

Local-first assistant for preparing and submitting job applications on LinkedIn
Easy Apply. It automates the tedious parts (scanning forms, matching answers,
filling fields, drafting documents) and keeps the consequential parts (file
uploads, final submission) in human hands.

## Safety boundaries (hard)

- jobbot **never** uploads a file and **never** clicks Submit / Send / Absenden.
- A daily application cap is enforced (default 10; editable in
  `data/preferences.json` → `daily_cap`).
- A preparation gate blocks any application until job URL, master CV review,
  tailored documents, user review, and hash match are all present.
- Manifest document paths cannot escape the application folder.

## Setup

1. `npm ci`
2. Copy `data/examples/profile.example.json` → `data/profile.json` and edit.
3. Copy `data/examples/answers.example.json` → `data/answers.json` and edit.
4. Place your master CV and cover letter in `CVs/MASTER_CV.md` and
   `CVs/MASTER_COVER_LETTER.md` (gitignored; never committed).
5. `npm test` and `npm run osv`.

## Browser profile (ephemeral)

Each `jobbot browser` run uses a fresh temporary Chrome profile (under the OS
temp dir). Nothing persists between runs — you re-login each time. This is
deliberate: no stale cookies, no cross-session leakage. Pass `--profile <dir>`
to override the location. `browser-profile/` is no longer used.

## Application flow

1. `jobbot browser` — launch Chrome with the jobbot profile.
2. `jobbot open` — open a job's Easy Apply modal.
3. `jobbot scan` — read-only field dump of the current page.
4. `jobbot plan` — build a fill plan (dry run).
5. `jobbot apply` — fill one page and click Next only.
6. `jobbot status` — daily cap usage + recent audit entries.

## Document pipeline

1. `jobbot intake <job-url>` — create an application folder.
2. Run the persona pipeline (research → draft CV/letter → check-docs).
3. `jobbot render <input.md>` — render to PDF + DOCX.
4. `jobbot verify <pdf>` — render PDF pages to PNG for visual inspection.
5. Review and approve the drafts; then apply.

## Dashboard

`npm run dashboard` opens the control tower at `http://127.0.0.1:<port>`.

## Editing the daily cap

Set `daily_cap` in `data/preferences.json` (default 10). The cap is read at
runtime by `jobbot status` and the apply flow.
