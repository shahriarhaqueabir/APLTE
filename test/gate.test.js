import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  assertPreparationComplete,
  assertManifestPresent,
  resolveManifestPath,
  validateManifest,
} from '../src/preparation/gate.js';

function tempDir() {
  return mkdtempSync(join(tmpdir(), 'jobbot-gate-'));
}

function sha(content) {
  return createHash('sha256').update(content).digest('hex');
}

// Build a fully prepared application folder. Every switch lets one requirement
// fail while the others stay satisfied, so a test proves exactly that check.
function makeApp({
  userReviewed = true,
  masterCvReviewed = true,
  withDocs = true,
  writeManifestFile = true,
  tamperHash = false,
  dropHash = false,
  escapePath = false,
  emptyDoc = false,
} = {}) {
  const dir = tempDir();

  let docs = [];
  if (withDocs) {
    mkdirSync(join(dir, 'cv'), { recursive: true });
    mkdirSync(join(dir, 'cover-letter'), { recursive: true });
    const files = [
      ['cv/cv.pdf', 'cv pdf'],
      ['cv/cv.docx', 'cv docx'],
      ['cover-letter/cl.pdf', 'cl pdf'],
      ['cover-letter/cl.docx', 'cl docx'],
    ];
    for (const [rel, content] of files) writeFileSync(join(dir, rel), content);
    docs = [
      { name: 'cv.pdf', path: 'cv/cv.pdf', type: 'cv' },
      { name: 'cv.docx', path: 'cv/cv.docx', type: 'cv' },
      { name: 'cl.pdf', path: 'cover-letter/cl.pdf', type: 'cover-letter' },
      { name: 'cl.docx', path: 'cover-letter/cl.docx', type: 'cover-letter' },
    ].map((d) => {
      const content = files.find((f) => f[0] === d.path)[1];
      let hash = sha(d.name === 'cv.pdf' && tamperHash ? 'different content' : content);
      if (dropHash && d.name === 'cv.docx') hash = null;
      return { ...d, hash, generatedAt: new Date().toISOString() };
    });
  }

  if (emptyDoc) {
    // Manifest records a hash for the original content, but the file on disk is empty.
    writeFileSync(join(dir, 'cv', 'cv.pdf'), '');
  }

  if (escapePath) {
    // Point the CV PDF at a file outside the application folder.
    const outside = join(tempDir(), 'outside.pdf');
    writeFileSync(outside, 'outside content');
    docs = docs.map((d) => (d.name === 'cv.pdf'
      ? { ...d, path: outside, hash: sha('outside content') }
      : d));
  }

  const manifest = {
    version: '1.0',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    job: { url: 'https://example.com/job', company: 'TestCo', role: 'Engineer', platform: 'linkedin-easy-apply' },
    application: { date: '2026-11-09', status: 'prepared', userReviewed },
    preparation: { masterCvReviewed },
    documents: docs,
  };
  if (writeManifestFile) writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  return { dir, manifest };
}

function assertBlocked(fn, checkName) {
  assert.throws(fn, (err) => {
    assert.equal(err.code, 'APPLICATION_BLOCKED', `expected APPLICATION_BLOCKED, got ${err.code}: ${err.message}`);
    assert.ok(
      Array.isArray(err.failed) && err.failed.includes(checkName),
      `expected failed checks to include "${checkName}", got ${JSON.stringify(err.failed)}`
    );
    return true;
  });
}

test('assertPreparationComplete passes when all checks met', () => {
  const fx = makeApp();
  const result = assertPreparationComplete(fx.manifest, fx.dir);
  assert.equal(result.ok, true);
  assert.equal(result.checks.job_description, true);
  assert.equal(result.checks.master_cv_reviewed, true);
  assert.equal(result.checks.tailored_cv_pdf, true);
  assert.equal(result.checks.tailored_cv_docx, true);
  assert.equal(result.checks.tailored_cover_letter_pdf, true);
  assert.equal(result.checks.tailored_cover_letter_docx, true);
  assert.equal(result.checks.manifest_exists, true);
  assert.equal(result.checks.documents_validated, true);
  assert.equal(result.checks.user_reviewed, true);
});

test('assertPreparationComplete throws when manifest is null', () => {
  const dir = tempDir();
  assert.throws(
    () => assertPreparationComplete(null, dir),
    (err) => err.message.includes('APPLICATION_BLOCKED') && err.code === 'APPLICATION_BLOCKED'
  );
});

test('assertPreparationComplete throws when job.url missing', () => {
  const fx = makeApp();
  delete fx.manifest.job.url;
  writeFileSync(join(fx.dir, 'manifest.json'), JSON.stringify(fx.manifest, null, 2));
  assertBlocked(() => assertPreparationComplete(fx.manifest, fx.dir), 'job_description');
});

test('assertPreparationComplete throws when user_reviewed is false', () => {
  // Manifest exists, documents are present and hashed, master CV acknowledged —
  // only the tailored-document review flag fails.
  const fx = makeApp({ userReviewed: false });
  assertBlocked(() => assertPreparationComplete(fx.manifest, fx.dir), 'user_reviewed');
});

test('assertPreparationComplete throws when the master CV review is not acknowledged', () => {
  const fx = makeApp({ masterCvReviewed: false });
  assertBlocked(() => assertPreparationComplete(fx.manifest, fx.dir), 'master_cv_reviewed');
});

test('assertPreparationComplete throws when the master CV acknowledgement is absent', () => {
  const fx = makeApp();
  delete fx.manifest.preparation;
  writeFileSync(join(fx.dir, 'manifest.json'), JSON.stringify(fx.manifest, null, 2));
  assertBlocked(() => assertPreparationComplete(fx.manifest, fx.dir), 'master_cv_reviewed');
});

test('assertPreparationComplete throws when no documents are listed', () => {
  const fx = makeApp({ withDocs: false });
  assertBlocked(() => assertPreparationComplete(fx.manifest, fx.dir), 'tailored_cv_pdf');
});

test('assertPreparationComplete throws when a tailored document is missing on disk', () => {
  const fx = makeApp();
  // Remove the cover letter DOCX after the manifest hashed it.
  rmSync(join(fx.dir, 'cover-letter', 'cl.docx'));
  assertBlocked(() => assertPreparationComplete(fx.manifest, fx.dir), 'tailored_cover_letter_docx');
});

test('assertPreparationComplete throws when a required document is empty', () => {
  const fx = makeApp({ emptyDoc: true });
  assertBlocked(() => assertPreparationComplete(fx.manifest, fx.dir), 'tailored_cv_pdf');
});

test('assertPreparationComplete throws when a document path escapes the application folder', () => {
  const fx = makeApp({ escapePath: true });
  assertBlocked(() => assertPreparationComplete(fx.manifest, fx.dir), 'tailored_cv_pdf');
});

test('assertPreparationComplete throws on hash mismatch', () => {
  const fx = makeApp({ tamperHash: true });
  assertBlocked(() => assertPreparationComplete(fx.manifest, fx.dir), 'documents_validated');
});

test('assertPreparationComplete throws when a listed document has no hash', () => {
  const fx = makeApp({ dropHash: true });
  assertBlocked(() => assertPreparationComplete(fx.manifest, fx.dir), 'documents_validated');
});

test('assertPreparationComplete throws when manifest.json is absent from the output folder', () => {
  const fx = makeApp({ writeManifestFile: false });
  assertBlocked(() => assertPreparationComplete(fx.manifest, fx.dir), 'manifest_exists');
});

test('assertManifestPresent throws when no manifest path was resolved', () => {
  assert.throws(
    () => assertManifestPresent(null),
    (err) => err.code === 'APPLICATION_BLOCKED' && /no manifest/i.test(err.message)
  );
  assert.throws(
    () => assertManifestPresent(join(tempDir(), 'missing', 'manifest.json')),
    (err) => err.code === 'APPLICATION_BLOCKED'
  );
});

test('assertManifestPresent rejects a directory and accepts a real manifest file', () => {
  const dir = tempDir();
  assert.throws(() => assertManifestPresent(dir), (err) => err.code === 'APPLICATION_BLOCKED');

  const manifestPath = join(dir, 'manifest.json');
  writeFileSync(manifestPath, '{}');
  assert.equal(assertManifestPresent(manifestPath), manifestPath);
});

test('resolveManifestPath returns the newest manifest, or null when there is none', () => {
  const outDir = tempDir();
  assert.equal(resolveManifestPath(outDir), null);

  mkdirSync(join(outDir, '2026-01-01-older'), { recursive: true });
  writeFileSync(join(outDir, '2026-01-01-older', 'manifest.json'), '{}');
  mkdirSync(join(outDir, '2026-02-02-newer'), { recursive: true });
  writeFileSync(join(outDir, '2026-02-02-newer', 'manifest.json'), '{}');

  const resolved = resolveManifestPath(outDir);
  assert.ok(resolved && resolved.includes('2026-02-02-newer'));
});

test('resolveManifestPath prefers an explicit path when supplied', () => {
  const explicit = join(tempDir(), 'manifest.json');
  assert.equal(resolveManifestPath(tempDir(), explicit), explicit);
});

test('validateManifest returns missing fields for incomplete manifest', () => {
  const result = validateManifest({});
  assert.equal(result.valid, false);
  assert.ok(result.missing.includes('job.url'));
  assert.ok(result.missing.includes('job.company'));
  assert.ok(result.missing.includes('job.role'));
});

test('validateManifest returns valid for complete manifest', () => {
  const manifest = {
    job: { url: 'https://example.com', company: 'Co', role: 'Eng' },
    application: { date: '2026-11-09' },
    documents: [],
  };
  const result = validateManifest(manifest);
  assert.equal(result.valid, true);
  assert.deepEqual(result.missing, []);
});

test('validateManifest returns missing for null manifest', () => {
  const result = validateManifest(null);
  assert.equal(result.valid, false);
  assert.ok(result.missing.includes('manifest'));
});
