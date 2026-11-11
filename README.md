# jobbot

Local-first assistant for preparing and submitting job applications on LinkedIn Easy
Apply. It helps research a vacancy, tailor a CV and cover letter, run a preparation
gate, and drive the browser fill flow — while never uploading a file and never
clicking Submit.

This repository ships **source code, tests, templates and persona definitions only**.
Personal data (CVs, cover letters, application logs, profile/answers, rendered
output, agent memory) is gitignored and must be supplied locally.

## Requirements

- Node.js 26.x (see `.nvmrc`; `engines` in `package.json`)
- Google Chrome (for rendering and the browser flow)
- Poppler (`pdftoppm`) for PDF visual verification
- Optional: chromedriver (resolved via `CHROMEDRIVER_PATH`, a repo-local
  `bin/chromedriver.exe`, or Selenium Manager)

## Install

```bash
npm ci
```

## Quick start

1. Copy the example profile and answers into place and edit them:

   ```bash
   cp data/examples/profile.example.json data/profile.json
   cp data/examples/answers.example.json data/answers.json
   ```

2. Put your master CV and cover letter in `CVs/MASTER_CV.md` and
   `CVs/MASTER_COVER_LETTER.md` (these are gitignored).

3. Run the test suite:

   ```bash
   npm test
   ```

4. Start the dashboard:

   ```bash
   npm run dashboard
   ```

5. Render a document:

   ```bash
   npm run render -- <input.md> [output-dir] [--lang de|en] [--title "Title"]
   ```

## Commands

| Command | Description |
|---|---|
| `jobbot browser` | Launch Chrome with the jobbot profile |
| `jobbot check` | Prove the Selenium attach works |
| `jobbot open` | Click Easy Apply and wait for the modal |
| `jobbot scan` | Read-only field dump of the current page |
| `jobbot plan` | Build a fill plan from the last scan (dry run) |
| `jobbot apply` | Execute the pending plan (fills one page, clicks Next only) |
| `jobbot status` | Daily cap usage + recent audit entries |
| `jobbot intake` | Create a new application folder from a job URL |
| `jobbot workflow` | Show workflow state for an application folder |
| `jobbot approve` | Approve a workflow step: `jobbot approve <folder> <step>` |
| `jobbot render` | Render a markdown file to PDF + DOCX |
| `jobbot verify` | Render a PDF to PNG pages for visual inspection |

## Safety

- The assistant never uploads a file and never clicks Submit.
- A 10 applications/day cap is enforced.
- A preparation gate (`assertPreparationComplete`) blocks any application until
  job URL, master CV review, documents, user review and hash match are present.
- Personal data is never committed; see `.gitignore`.

## Layout standard

CV and cover-letter templates are frozen (Arial 9.5pt / 10.5pt, 1.4 line
height, 15mm / 0.79in margins, black text only, bullet glyph U+25CF, A4).
Content lives only in plain Markdown data files.

## License

Private project.
