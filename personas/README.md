# Persona Library — jobbot

This folder holds reusable **persona definitions** for orchestrating specialized subagents.
Each persona is a focused mindset + capability profile. Dispatch them via the `subagent` tool
with the persona's prompt as the system framing, or paste the persona block into a subagent prompt.

## How to use (orchestration protocol)

1. **Identify the task type** (write CV, write cover letter, review application, research company, verify layout, ATS-optimize, etc.).
2. **Select the matching persona** from this library (or create a new one on demand).
3. **Dispatch as a subagent** (`agent: "general"` or `cheap-*`) with the persona text + task-specific context.
4. **Run independent personas in parallel** when there are no data dependencies (e.g., writer + researcher).
5. **Sequence dependent ones** (researcher → writer → recruiter → visual-qa).
6. **Main thread (leader) orchestrates, integrates results, runs build commands, and declares completion** only after verification.
7. **Traceability:** every persona run appends one JSONL line to `.memory/persona-runs.jsonl` (timestamp, persona, task, outputs[], status). Read first, never overwrite.

The leader (user) sets direction; the legion executes and reports back. Audit trail: `.memory/persona-runs.jsonl`.

## Available personas

| File | Persona | Primary use |
|---|---|---|
| `cv-writer.md` | CV Writer (DACH, ATS-first) | Draft/trim CV markdown |
| `cover-letter-writer.md` | Cover Letter Writer | Draft tailored cover letters |
| `recruiter-dach.md` | Technical Recruiter (DACH) | Review CV + cover letter |
| `visual-qa.md` | Visual QA / Layout Inspector | Inspect rendered PNG pages |
| `company-researcher.md` | Company & Role Researcher | Research employer, role, keywords |
| `ats-optimizer.md` | ATS Keyword Optimizer | Align CV keywords to a vacancy |
| `fact-checker.md` | Fact Checker / Source Verifier | Audit claims against sources |

Create new persona files on demand; keep each focused and reusable.