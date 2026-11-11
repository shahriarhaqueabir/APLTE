// src/preparation/gate.js
// Mandatory preparation gate — blocks application start until all
// preparation artifacts are present and validated.
//
// Implements the user's principle: "block_application_if_incomplete"
// The gate is enforced in code, not just in documentation.
//
// Required checks (project rules):
//   job URL · master CV reviewed · documents present · user review · hash match

import { existsSync, readFileSync, statSync, readdirSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { createHash } from 'node:crypto';

/**
 * Validate that a path points to an existing, non-empty regular file.
 * @param {string} filePath
 * @returns {boolean}
 */
function fileExistsAndNonEmpty(filePath) {
  if (!filePath || !existsSync(filePath)) return false;
  try {
    const stat = statSync(filePath);
    return stat.isFile() && stat.size > 0;
  } catch {
    return false;
  }
}

/**
 * Compute SHA-256 hash of a file.
 * @param {string} filePath
 * @returns {string|null}
 */
function hashFile(filePath) {
  if (!existsSync(filePath)) return null;
  const buf = readFileSync(filePath);
  return createHash('sha256').update(buf).digest('hex');
}

/**
 * Resolve a manifest-relative document path, refusing escapes from outputDir.
 * A document may never point at an unrelated file elsewhere on disk.
 *
 * @param {string} outputDir
 * @param {string} relPath
 * @returns {string|null} absolute path inside outputDir, or null when it escapes
 */
function resolveInside(outputDir, relPath) {
  if (typeof relPath !== 'string' || !relPath) return null;
  const base = resolve(outputDir);
  const full = resolve(base, relPath);
  if (full !== base && !full.startsWith(base + sep)) return null;
  return full;
}

/**
 * Resolve the manifest to gate on.
 *
 * @param {string} outDir - directory holding one folder per application
 * @param {string} [explicitPath] - user-supplied --manifest path
 * @returns {string|null} newest manifest.json, or null when none exists
 */
export function resolveManifestPath(outDir, explicitPath) {
  if (explicitPath) return explicitPath;
  if (!outDir || !existsSync(outDir)) return null;
  const found = readdirSync(outDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => join(outDir, d.name, 'manifest.json'))
    .filter((p) => existsSync(p))
    .sort()
    .reverse();
  return found[0] || null;
}

/**
 * Refuse to proceed when no manifest can be found.
 *
 * @param {string|null} manifestPath
 * @returns {string} the path, when it is an existing regular file
 * @throws {Error} APPLICATION_BLOCKED when missing or not a file
 */
export function assertManifestPresent(manifestPath) {
  if (!manifestPath || !fileExistsAndNonEmpty(manifestPath)) {
    const err = new Error(
      'APPLICATION_BLOCKED: No manifest found. Preparation incomplete. ' +
      'Run the preparation pipeline first, or pass --manifest <path>.'
    );
    err.code = 'APPLICATION_BLOCKED';
    err.failed = ['manifest_exists'];
    throw err;
  }
  return manifestPath;
}

/**
 * Assert that preparation is complete before an application can start.
 *
 * @param {object} manifest - the application manifest (from createManifest)
 * @param {string} outputDir - the application output directory
 * @throws {Error} if preparation is incomplete
 * @returns {{ ok: true, checks: object }}
 */
export function assertPreparationComplete(manifest, outputDir) {
  const checks = {
    job_description: false,
    master_cv_reviewed: false,
    tailored_cv_pdf: false,
    tailored_cv_docx: false,
    tailored_cover_letter_pdf: false,
    tailored_cover_letter_docx: false,
    manifest_exists: false,
    documents_validated: false,
    user_reviewed: false,
  };

  if (!manifest) {
    const err = new Error('APPLICATION_BLOCKED: No manifest provided. Preparation incomplete.');
    err.code = 'APPLICATION_BLOCKED';
    err.failed = ['manifest'];
    throw err;
  }

  // 1. Job description
  checks.job_description = Boolean(manifest.job && manifest.job.url);

  // 2. Master CV reviewed — an explicit acknowledgement recorded in the
  //    manifest. A source file existing on disk is never proof of review.
  checks.master_cv_reviewed = Boolean(
    manifest.preparation && manifest.preparation.masterCvReviewed === true
  );

  // 3-6. Tailored document existence + non-empty
  const docs = Array.isArray(manifest.documents) ? manifest.documents : [];
  const find = (type, ext) => docs.find((d) => d.type === type && typeof d.path === 'string' && d.path.endsWith(ext));
  const cvPdf = find('cv', '.pdf');
  const cvDocx = find('cv', '.docx');
  const clPdf = find('cover-letter', '.pdf');
  const clDocx = find('cover-letter', '.docx');

  const present = (doc) => {
    if (!doc) return false;
    const full = resolveInside(outputDir, doc.path);
    return full ? fileExistsAndNonEmpty(full) : false;
  };

  checks.tailored_cv_pdf = present(cvPdf);
  checks.tailored_cv_docx = present(cvDocx);
  checks.tailored_cover_letter_pdf = present(clPdf);
  checks.tailored_cover_letter_docx = present(clDocx);

  // 7. Manifest exists
  checks.manifest_exists = fileExistsAndNonEmpty(join(outputDir, 'manifest.json'));

  // 8. Document validation: every listed document must stay inside the
  //    application folder, exist, be non-empty, and match its recorded hash.
  //    A missing hash cannot be validated, so it fails rather than being skipped.
  let documentsValidated = docs.length > 0;
  for (const doc of docs) {
    const full = resolveInside(outputDir, doc.path);
    if (!full || !doc.hash || !fileExistsAndNonEmpty(full) || hashFile(full) !== doc.hash) {
      documentsValidated = false;
      break;
    }
  }
  checks.documents_validated = documentsValidated;

  // 9. User reviewed
  checks.user_reviewed = Boolean(manifest.application && manifest.application.userReviewed);

  // Every documented safety requirement is mandatory.
  const requiredChecks = [
    'job_description',
    'master_cv_reviewed',
    'manifest_exists',
    'user_reviewed',
    'tailored_cv_pdf',
    'tailored_cv_docx',
    'tailored_cover_letter_pdf',
    'tailored_cover_letter_docx',
    'documents_validated',
  ];

  const failed = requiredChecks.filter((k) => !checks[k]);

  if (failed.length > 0) {
    const err = new Error(
      `APPLICATION_BLOCKED: Preparation incomplete. Failed checks: ${failed.join(', ')}. ` +
      `Details: ${JSON.stringify(checks)}`
    );
    err.code = 'APPLICATION_BLOCKED';
    err.failed = failed;
    err.checks = checks;
    throw err;
  }

  return { ok: true, checks };
}

/**
 * Validate that a manifest has all required fields for a complete preparation.
 * @param {object} manifest
 * @returns {{ valid: boolean, missing: string[] }}
 */
export function validateManifest(manifest) {
  const missing = [];
  if (!manifest) { return { valid: false, missing: ['manifest'] }; }
  if (!manifest.job || !manifest.job.url) missing.push('job.url');
  if (!manifest.job || !manifest.job.company) missing.push('job.company');
  if (!manifest.job || !manifest.job.role) missing.push('job.role');
  if (!manifest.application || !manifest.application.date) missing.push('application.date');
  if (!manifest.documents || !Array.isArray(manifest.documents)) missing.push('documents');
  return { valid: missing.length === 0, missing };
}
