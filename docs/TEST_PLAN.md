# Test Plan — jobbot

## Current state
- **131 tests** pass with `npm test` (13 test files: 12 under `test/`, plus `tools/dashboard-browser-test.mjs`)
- `test/gate.test.js` covers every required preparation check: job URL, explicit master-CV acknowledgement, all four tailored documents (present, non-empty, path contained, hash recorded and matching), manifest presence, and user review
- Dashboard tests cover loopback binding, SSE startup, stream accounting, reconnect cancellation, shutdown after the final tab closes, action auditing (including audit-write failure), and the independent master-CV acknowledgement
- Dashboard browser checks cover table-header positioning, filtering, expansion, persistence, and one-tab/two-tab shutdown behavior
- CLI dispatcher tests remain outstanding (the gate itself is unit-tested; `src/cli.js` is exercised only manually)

## Test infrastructure needed
- `test/fixtures/` directory with sample data files
- Mock WebDriver (fake driver with `findElements`, `executeScript`, `wait`, `getTitle`, `getCurrentUrl`)
- jsdom for in-page extraction/fill testing (optional, may need `npm install jsdom`)
- Temp directories via `mkdtempSync` (already used in safety tests)

---

## 1. Untested modules (priority: high)

### 1.1 `src/scan/extract.js` — `extractInPage()` and `extractFields()`
**Priority:** High (core scanning logic, zero coverage)

| # | Test | Approach |
|---|------|----------|
| 1 | Returns `{error:'no-modal', fields:[], ...}` when no dialog exists | jsdom with no dialog element |
| 2 | Extracts text input (label, type, required, value) | jsdom fixture with `<input type="text">` + `<label for>` |
| 3 | Extracts tel input (type='tel') | jsdom fixture |
| 4 | Extracts email input (type='email') | jsdom fixture |
| 5 | Extracts select with options (value + label) | jsdom fixture with `<select>` + `<option>` |
| 6 | Extracts radio group (grouped by name, options with checked state) | jsdom fixture with radio group |
| 7 | Extracts checkbox (checked/unchecked) | jsdom fixture |
| 8 | Extracts textarea (value) | jsdom fixture |
| 9 | Required detection via `required` attribute | jsdom fixture |
| 10 | Required detection via trailing `*` in label | jsdom fixture |
| 11 | Label resolution: `label[for]` → `aria-labelledby` → `aria-label` → walk-up | jsdom fixture (4 sub-cases) |
| 12 | Page indicator parsing ("1/4 pages", "2/5 pages") | jsdom fixture with modal text |
| 13 | Button labels extracted (Next, Back, Submit, Easy Apply) | jsdom fixture |
| 14 | URL, domain, jobId, modalId, stage captured | jsdom with location mock |
| 15 | `extractFields(driver)` calls `executeScript` once and returns result | Mock driver |

### 1.2 `src/fill/execute.js` — `fillPage()`, `clickAdvance()`, `FILL_IN_PAGE`
**Priority:** High (core fill safety, zero coverage)

| # | Test | Approach |
|---|------|----------|
| 1 | `fillPage` calls `assertPlanFresh` and `assertPageUnchanged` | Mock driver, assert throws on stale plan |
| 2 | `fillPage` fills text field and verifies readback | Mock driver `executeScript` returns `{ok:true, readback:'value', how:'text'}` |
| 3 | `fillPage` fills select field and verifies readback | Mock driver returns `{ok:true, readback:'de', how:'select'}` |
| 4 | `fillPage` fills radio and verifies | Mock driver returns `{ok:true, readback:'clicked', how:'radio'}` |
| 5 | `fillPage` fills checkbox | Mock driver returns `{ok:true, readback:'true', how:'checkbox'}` |
| 6 | `fillPage` throws on fill failure (`{ok:false, error:'...'}`) | Mock driver returns failure |
| 7 | `fillPage` throws on `GuardError` from `assertFillable` (file input) | Plan with file field |
| 8 | `fillPage` clicks advance button (Next) and returns `nextClicked: true` | Mock driver returns `{ok:true, label:'Next'}` |
| 9 | `fillPage` refuses terminal button (Submit) | Mock driver returns `{ok:false, error:'terminal-button'}` |
| 10 | `clickAdvance` returns false when button not found | Mock driver returns `{ok:false, error:'button-not-found'}` |
| 11 | `FILL_IN_PAGE` (in-page): text input fill via native setter | jsdom |
| 12 | `FILL_IN_PAGE`: select option matching (exact, normalized) | jsdom |
| 13 | `FILL_IN_PAGE`: radio option matching by label | jsdom |
| 14 | `FILL_IN_PAGE`: checkbox toggle | jsdom |
| 15 | `FILL_IN_PAGE`: returns `label-not-found` when label missing | jsdom |
| 16 | `FILL_IN_PAGE`: returns `option-not-found` with available list | jsdom |

### 1.3 `src/preparation/gate.js` — `assertPreparationComplete()`, `validateManifest()`
**Priority:** High (safety-critical, pure filesystem) — **covered**

`test/gate.test.js` now asserts:

| # | Test | Approach |
|---|------|----------|
| 1 | Passes when every required check is met | Temp dir with manifest, four documents, hashes, review flags |
| 2 | Throws `APPLICATION_BLOCKED` when manifest is null | No manifest |
| 3 | Throws when `job.url` is missing | Manifest without job.url |
| 4 | Throws when `application.userReviewed` is false | All other checks satisfied |
| 5 | Throws when `preparation.masterCvReviewed` is false or absent | Explicit acknowledgement required |
| 6 | Throws when no documents are listed | Empty documents array |
| 7 | Throws when a tailored document is missing on disk | Deleted DOCX |
| 8 | Throws when a required document is empty | Zero-byte PDF |
| 9 | Throws when a document path escapes the application folder | Absolute path outside `outputDir` |
| 10 | Throws on hash mismatch, and when a listed document has no hash | Tampered / null hash |
| 11 | Throws when `manifest.json` is absent from the folder | Manifest passed in memory only |
| 12 | `assertManifestPresent` rejects null, missing, and directory paths | Temp dirs |
| 13 | `resolveManifestPath` picks the newest manifest and honours an explicit path | Temp dirs |
| 14 | `validateManifest` reports missing fields and accepts complete manifests | Unit |

Still untested here: `hashFile`/`fileExistsAndNonEmpty` are covered indirectly through the gate only.

### 1.4 `src/browser/open.js` — `openEasyApply()`
**Priority:** Medium (browser interaction, challenge detection)

| # | Test | Approach |
|---|------|----------|
| 1 | Finds Easy Apply button by CSS selector | Mock driver with `findElements` |
| 2 | Falls back to text search when CSS selector misses | Mock driver |
| 3 | Throws when no Easy Apply button found | Mock driver returns empty |
| 4 | Pre-challenge check throws `ChallengeError` | Mock driver returns challenge text |
| 5 | Post-challenge check throws `ChallengeError` | Mock driver returns challenge after modal |
| 6 | Returns `{opened: true, challenge: ...}` on success | Mock driver |
| 7 | `findChallengeSelectors` returns matching selectors | Mock driver |

### 1.5 `src/browser/driver.js` — `findChrome()`, `preflight()`, `chromeMajorFromInstall()`, `driverMajorFromBinary()`
**Priority:** Medium (version guard, runtime safety)

| # | Test | Approach |
|---|------|----------|
| 1 | `findChrome` returns first existing candidate | Mock fs (existsSync) |
| 2 | `findChrome` throws when no candidate exists | Mock fs |
| 3 | `findChrome` respects JOBBOT_CHROME env var (after fix) | Set env, mock fs |
| 4 | `chromeMajorFromInstall` returns major from version dir | Temp dir with version folders |
| 5 | `chromeMajorFromInstall` returns null on error | Non-existent path |
| 6 | `driverMajorFromBinary` parses `--version` output | Mock execFileSync |
| 7 | `driverMajorFromBinary` throws when binary missing | Mock fs |
| 8 | `preflight` returns object with matching majors | Mock inputs |
| 9 | `preflight` throws `VersionMismatchError` on mismatch | Mock inputs |

### 1.6 `src/render/manifest.js` — `createManifest()`, `updateManifest()`, `fileHash()`
**Priority:** Medium (document integrity)

| # | Test | Approach |
|---|------|----------|
| 1 | `fileHash` returns 64-hex for existing file | Temp file |
| 2 | `fileHash` returns null for missing file | Non-existent path |
| 3 | `createManifest` writes manifest.json with correct structure | Temp dir |
| 4 | `createManifest` computes document hashes | Temp dir with files |
| 5 | `createManifest` handles missing documents gracefully | Empty documents array |
| 6 | `updateManifest` updates status | Create then update |
| 7 | `updateManifest` updates documents with new hashes | Create then update |
| 8 | `updateManifest` handles missing manifest (creates new) | Non-existent manifest path |
| 9 | `updateManifest` adds notes | Create then update with notes |

### 1.7 `src/render/letter.js` — `buildHtml()`, `renderLetter()`
**Priority:** Medium (rendering pipeline)

| # | Test | Approach |
|---|------|----------|
| 1 | `buildHtml` converts headings (h1, h2, h3) | Unit test |
| 2 | `buildHtml` converts bullet lists | Unit test |
| 3 | `buildHtml` converts paragraphs | Unit test |
| 4 | `buildHtml` escapes HTML in text (XSS prevention) | Unit test with `<script>` |
| 5 | `buildHtml` applies bold formatting (`**text**`) | Unit test |
| 6 | `buildHtml` detects contact line and wraps in `.contact` | Unit test |
| 7 | `buildHtml` generates semantic `<section>` and `<article>` | Unit test |
| 8 | `renderLetter` writes md, html, pdf, docx files | Integration test (requires Chrome) |
| 9 | `renderLetter` returns correct paths | Integration test |
| 10 | `renderLetter` handles missing Chrome gracefully | Mock findChrome |

### 1.8 `src/render/cv.js` — `renderCv()`
**Priority:** Low (thin wrapper around renderLetter)

| # | Test | Approach |
|---|------|----------|
| 1 | `renderCv` passes CV-specific defaults (cv.md, cv.pdf, cv.docx, styleType='cv') | Mock renderLetter |
| 2 | `renderCv` allows override of defaults | Mock renderLetter |

### 1.9 `src/render/style.js` — `cssForDoc()`, `docxStylesXml()`, `docxNumberingXml()`
**Priority:** Low (pure string generation)

| # | Test | Approach |
|---|------|----------|
| 1 | `cssForDoc('cv')` contains CV_STYLE values | String assertion |
| 2 | `cssForDoc('letter')` contains LETTER_STYLE values | String assertion |
| 3 | `docxStylesXml()` contains Calibri font | String assertion |
| 4 | `docxNumberingXml('●')` contains bullet char | String assertion |

### 1.10 `src/log/applied.js` — `appendApplied()`, `readApplied()`
**Priority:** Medium (data integrity)

| # | Test | Approach |
|---|------|----------|
| 1 | `appendApplied` writes JSON line with timestamp | Temp file |
| 2 | `appendApplied` creates parent directory | Temp dir (non-existent) |
| 3 | `appendApplied` returns the row | Temp file |
| 4 | `readApplied` returns `[]` for missing file | Non-existent path |
| 5 | `readApplied` parses valid JSONL | Temp file with multiple lines |
| 6 | `readApplied` throws on malformed JSON with line number | Temp file with bad line |
| 7 | `readApplied` ignores trailing empty lines | Temp file with trailing newline |

### 1.11 `src/status.js` — `buildStatus()`, `formatStatus()`
**Priority:** Medium (reporting)

| # | Test | Approach |
|---|------|----------|
| 1 | `buildStatus` counts today's applications from applied.jsonl | Temp files with mixed dates |
| 2 | `buildStatus` counts today's applications from audit.jsonl | Temp files |
| 3 | `buildStatus` returns recent (last 5) applications | Temp file with 10 entries |
| 4 | `buildStatus` returns `remaining = cap - used` | Temp file |
| 5 | `buildStatus` handles missing files (0 entries) | Non-existent paths |
| 6 | `formatStatus` produces readable text with all fields | Assert string contains |
| 7 | `formatStatus` shows "No applications logged yet." when empty | Empty status |

### 1.12 `src/orchestration/application.js` — all functions
**Priority:** Medium (state machine)

| # | Test | Approach |
|---|------|----------|
| 1 | `createApplication` sets defaults (status='started', empty pages, etc.) | Assert fields |
| 2 | `createApplication` maps job fields (url, company, role, platform) | Assert |
| 3 | `createApplication` sets document paths from options | Assert |
| 4 | `startPage` increments pageNumber | Call twice |
| 5 | `startPage` sets status to 'scanning' | Assert |
| 6 | `startPage` captures scanResult fields | Assert |
| 7 | `attachPlan` links plan to current page | Assert |
| 8 | `attachPlan` collects unknowns from plan | Plan with unknowns |
| 9 | `attachPlan` sets status to 'reviewing' | Assert |
| 10 | `getUnknownBatch` returns only unresolved unknowns | Resolve some, check batch |
| 11 | `resolveUnknownBatch` resolves matching keys | Apply resolutions |
| 12 | `resolveUnknownBatch` sets confidence/source defaults | Assert |
| 13 | `resolveUnknownBatch` stores in resolvedAnswers | Assert |
| 14 | `markPageFilled` sets status and filled array | Assert |
| 15 | `markPageAdvanced` sets status to 'scanning' | Assert |
| 16 | `markHandover` sets status to 'handover' | Assert |
| 17 | `markSubmitted` sets status to 'submitted' + timestamp | Assert |
| 18 | `markClosed` sets status to 'closed' + reason | Assert |
| 19 | `summariseApplication` includes key info | Assert string contains |
| 20 | `saveApplication` / `loadApplication` round-trip | Temp file |
| 21 | `loadApplication` returns null for missing file | Non-existent path |

### 1.13 `src/cli.js` — dispatcher
**Priority:** Low (integration-level, hard to unit test)

| # | Test | Approach |
|---|------|----------|
| 1 | `--help` / `help` prints usage and exits 0 | Spawn process |
| 2 | Unknown command prints error and exits 1 | Spawn process |
| 3 | `status` prints status report | Spawn with temp data dir |
| 4 | `render` with missing input prints usage | Spawn process |
| 5 | `plan` without scan prints error | Spawn with temp data dir |

### 1.14 `src/browser/driver.js` — `findChrome()`, `preflight()`, etc.
**Priority:** Medium (version guard, runtime safety)

| # | Test | Approach |
|---|------|----------|
| 1 | `findChrome` returns first existing candidate | Mock existsSync |
| 2 | `findChrome` throws when no candidate exists | Mock existsSync |
| 3 | `chromeMajorFromInstall` parses version dirs | Temp dir |
| 4 | `chromeMajorFromInstall` returns null on error | Non-existent path |
| 5 | `driverMajorFromBinary` parses `--version` output | Mock execFileSync |
| 6 | `driverMajorFromBinary` throws when binary missing | Mock existsSync |
| 7 | `preflight` returns object with matching majors | Mock inputs |
| 8 | `preflight` throws `VersionMismatchError` on mismatch | Mock inputs |

### 1.15 `src/util/log.js` — `createLogger()`, `redact()`
**Priority:** Low (simple utility)

| # | Test | Approach |
|---|------|----------|
| 1 | `createLogger` respects level threshold (debug suppressed at info) | Capture stream |
| 2 | `createLogger` emits at or above threshold | Capture stream |
| 3 | `redact` returns `****` for short strings (≤4 chars) | Assert |
| 4 | `redact` partially reveals long strings | Assert format |

---

## 2. Edge cases to add to existing tests

### 2.1 `src/util/hash.js`
- `canonicalize(null)` → `'null'`
- `canonicalize(true)` → `'true'`
- `canonicalize(42)` → `'42'`
- `canonicalize({a: {b: 1}})` key-order independent at depth
- `sha256(42)` → equals `sha256('42')`
- `pageHash` with field missing `options` property
- `pageHash` with non-array input (should throw or handle)

### 2.2 `src/profile/schema.js`
- Whitespace-only personal strings rejected
- Array sections validated as arrays (not objects)
- `validateAnswers([])` returns ok=true
- `validateAnswers` with missing `approvedAt` → error
- `validateAnswers` with invalid provenance fields (`approved: 'yes'`, `confirmedAt: 'bad'`, `requiresReview: 'no'`)
- `validateAnswers` with `match.all` as non-array
- Duplicate answer IDs with provenance fields

### 2.3 `src/fill/guard.js`
- `isTerminalButton('')` → false
- `isTerminalButton('SUBMIT')` → true
- `isTerminalButton('submission')` → false (word boundary)
- `isAdvanceAllowed('')` → false
- `assertFillable` allows `checkbox`, `select`, `text` (no throw)
- `assertPlanFresh` boundary: `age === -5000` passes, `age === PLAN_TTL_MS` expires
- `assertPageUnchanged` with url/domain/jobId/modalId/stage mismatch → respective error codes
- `assertPageUnchanged` with field key/type/label change → respective error codes
- `assertPageUnchanged` with field count change → `FIELD_COUNT_CHANGED`
- `assertPageUnchanged` with buttons mismatch → `ACTIONS_CHANGED`
- `assertPageUnchanged` with array-form snapshot (backward compat)

### 2.4 `src/plan/match.js`
- `normalize('Straße')` → `'strasse'`
- `tokenize('')` → `[]`
- `tokenize('a,,b')` → `['a', 'b']`
- `detectLanguage` with equal counts → `'en'`
- `matchQuestion` with empty-all entries → ambiguous
- `resolveOption` with CEFR synonyms (Fließend, Verhandlungssicher, etc.)
- `resolveOption` with range boundaries (less than, more than, +, single)
- `resolveOption` with decimal numbers
- `resolveOption` with null options → `{ok: false, reason: 'no-options'}`

### 2.5 `src/fill/cap.js`
- `readAudit` with blank lines + malformed line → error with line number
- `countApplicationsOn` with invalid `ts` → no crash
- `assertUnderCap` with custom cap and `used === cap` → throws
- `assertUnderCap` with `cap: 0` and empty file → throws

### 2.6 `src/fill/audit.js`
- `createAudit` with `sensitive: true` and `value: undefined` → no valueHash
- `createAudit` creates parent directory
- `createAudit` with `now` returning a fixed date

### 2.7 `src/scan/challenge.js`
- `detectChallenge` called twice → consistent result
- `detectChallenge` with empty text and no selectors → `{detected: false, hits: []}`

### 2.8 `src/browser/versions.js`
- `compareVersions('1.2', '1.2.0')` → 0
- `pickHighestVersion([])` → null
- `parseMajor('')` → null
- `assertMajorMatch` with negative numbers → throws

### 2.9 `src/browser/launch.js`
- `assertSafeArgs(['--foo--headless=new'])` → not falsely refused
- `launchArgs` with custom port
- `waitForDevTools` timeout behavior (mock fetch)

### 2.10 `src/plan/build.js`
- `buildPlan(null, answers)` → no crash, empty fills
- `buildPlan(scan, null)` → no crash
- `buildPlan` with `advanceButton` case-insensitive matching
- `summarisePlan` with unknowns and ambiguities
- `summarisePlan` without pageIndicator

---

## 3. Integration tests needed

### 3.1 End-to-end CLI flow
- Run `scan → plan → apply` with a mock driver and temp data dir
- Assert: scan.json created, pending-plan.json created, audit log written, cap consulted
- Assert: apply refuses when page changed (hash mismatch)
- Assert: apply refuses when plan expired

### 3.2 Preparation gate + manifest + documents
- Create manifest, render docs, assert gate passes
- Remove a document, assert gate fails
- Hash mismatch, assert gate fails

### 3.3 Orchestration application lifecycle
- Create application → startPage → attachPlan → fill → advance → submit
- Assert state transitions and persisted JSON
- Test handover flow (markHandover → user continues)

### 3.4 Render pipeline
- Render CV + cover letter to PDF + DOCX in one folder
- Assert files exist, PDF has correct page count, DOCX is valid zip
- Requires Chrome in CI environment

---

## 4. Test infrastructure

### 4.1 Shared fixtures
Create `test/fixtures/` with:
- `easy-apply-page.html` — sample Easy Apply modal HTML
- `challenge-page.html` — sample challenge page
- `scan-result.json` — sample scan output
- `answers.json` — sample answer bank
- `profile.json` — sample profile

### 4.2 Mock WebDriver
Create `test/helpers/mock-driver.js` with:
- `findElements(selector)` → returns mock elements
- `executeScript(fn, ...args)` → returns mock result
- `wait(condition, timeout)` → resolves immediately
- `getTitle()` → returns test title
- `getCurrentUrl()` → returns test URL

### 4.3 Test utilities
- `test/helpers/temp-dir.js` — create/clean temp directories
- `test/helpers/assert-error.js` — assert error code and message

---

## 5. Priority order for implementation

1. **High:** `scan/extract.js` tests with jsdom (core scanning logic)
2. **High:** `fill/execute.js` tests with mock driver (core fill safety)
3. **Medium:** `log/applied.js`, `status.js`, `render/manifest.js` tests
4. **Medium:** `orchestration/application.js` tests (state machine)
5. **Medium:** Edge cases in `fill/guard.js`, `plan/match.js`, `fill/cap.js`
6. **Low:** `render/style.js`, `render/cv.js`, `browser/attach.js`, `util/log.js`, `cli.js`
7. **Integration:** End-to-end CLI flow, prep gate + manifest, render pipeline

---

## 6. Estimated test count after full implementation

| Category | Current | Target | New tests |
|----------|---------|--------|-----------|
| Unit (pure logic) | 118 | ~180 | ~62 |
| Integration / browser | 13 | ~20 | ~7 |
| **Total** | **131** | **~190** | **~59** |