# Changelog

All notable changes to this project are documented here.
Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- `docs/ARCHITECTURE.md` — component map and data-flow walkthrough.
- `CONTRIBUTING.md` — development setup and safety rules.
- `JOBBOT_CHROME` env support in Chrome discovery (driver + renderer).
- `JOBBOT_ROOT` support in live-log path resolution.

### Changed
- `clickAdvance` now validates terminal/advance labels in-browser *before*
  clicking (safety fix).
- `resolveManifestPath` selects the newest manifest by `updatedAt`/`createdAt`.
- `status.remaining` now derived from the audit count (matches the gate).
- Render returns `docxPath: null` when `docx` is unavailable.
- `extractFields` no longer scans file/hidden/submit/button inputs as text.
- Confidence threshold for `fill-automatically` raised to 99.
- Text readback mismatch now throws (date fields stay soft).
- `check-docs` resolves paths against the package root.
- Workflow draft keys normalized by basename for the render gate.
- Render profile directory is unique per process (no concurrent collisions).

### Fixed
- Launch no longer spawns a duplicate Chrome when DevTools is already up.