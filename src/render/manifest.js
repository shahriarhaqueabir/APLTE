// src/render/manifest.js
// Generates a manifest.json for a self-contained application folder.

import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { defaultWorkflow } from '../workflow/machine.js';

/**
 * Compute SHA-256 hash of a file.
 * @param {string} filePath
 * @returns {string|null}
 */
export function fileHash(filePath) {
  if (!existsSync(filePath)) return null;
  const buf = readFileSync(filePath);
  return createHash('sha256').update(buf).digest('hex');
}

/**
 * Create or update a manifest.json in an application output folder.
 *
 * @param {string} outputDir - the application folder
 * @param {object} info
 * @param {string} [info.jobUrl] - source job URL
 * @param {string} [info.company] - company name
 * @param {string} [info.role] - role title
 * @param {string} [info.date] - application date (ISO)
 * @param {string} [info.platform] - 'linkedin-easy-apply' | 'external'
 * @param {string} [info.status] - 'prepared' | 'applied' | 'review'
 * @param {Array<{name, path, type}>} [info.documents] - list of documents
 * @param {boolean} [info.masterCvReviewed] - explicit master-CV review acknowledgement
 * @returns {object} the manifest object
 */
export function createManifest(outputDir, info = {}) {
  const now = new Date().toISOString();

  const manifest = {
    version: '1.0',
    createdAt: now,
    updatedAt: now,
    job: {
      url: info.jobUrl || null,
      company: info.company || null,
      role: info.role || null,
      platform: info.platform || 'linkedin-easy-apply',
    },
    application: {
      date: info.date || now.slice(0, 10),
      status: info.status || 'prepared',
    },
    workflow: defaultWorkflow(),
    report: {
      version: null,
      hash: null,
      path: null,
      approvedAt: null,
    },
    drafts: [],
    preparation: {
      // Explicit acknowledgement only. Never inferred from a source file
      // existing on disk — see src/preparation/gate.js.
      masterCvReviewed: Boolean(info.masterCvReviewed),
    },
    documents: (info.documents || []).map((doc) => ({
      name: doc.name,
      path: doc.path,
      type: doc.type || 'unknown',
      hash: doc.path ? fileHash(join(outputDir, doc.path)) : null,
      generatedAt: now,
    })),
    preferences: {
      followCompany: false,
      markAsTopChoice: false,
      coverLetter: 'always',
      reuseCoverLetter: false,
    },
  };

  const manifestPath = join(outputDir, 'manifest.json');
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  return manifest;
}

/**
 * Update an existing manifest (e.g., after status change).
 * @param {string} outputDir
 * @param {object} updates
 */
export function updateManifest(outputDir, updates = {}) {
  const manifestPath = join(outputDir, 'manifest.json');
  let manifest = {};
  if (existsSync(manifestPath)) {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  }
  manifest.updatedAt = new Date().toISOString();
  if (updates.status) manifest.application = { ...manifest.application, status: updates.status };
  if (updates.documents) {
    manifest.documents = updates.documents.map((doc) => ({
      ...doc,
      hash: doc.path ? fileHash(join(outputDir, doc.path)) : doc.hash,
      generatedAt: doc.generatedAt || manifest.updatedAt,
    }));
  }
  if (updates.notes) manifest.notes = updates.notes;
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  return manifest;
}
