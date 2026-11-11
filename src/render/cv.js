// src/render/cv.js
// Renders a tailored CV (markdown) to PDF + DOCX.
// Wraps renderLetter with CV-specific defaults.

import { renderLetter } from './letter.js';

/**
 * Render a tailored CV to PDF + DOCX.
 *
 * @param {string} markdownText - the CV content in markdown
 * @param {string} outputDir - directory to write files into
 * @param {object} [options]
 * @param {string} [options.lang='en']
 * @param {string} [options.title='Curriculum Vitae']
 * @returns {Promise<{ mdPath, htmlPath, pdfPath, docxPath }>}
 */
export async function renderCv(markdownText, outputDir, options = {}) {
  return renderLetter(markdownText, outputDir, {
    lang: options.lang || 'en',
    title: options.title || 'Curriculum Vitae',
    styleType: 'cv',
    mdName: options.mdName || 'cv.md',
    htmlName: options.htmlName || 'cv.html',
    pdfName: options.pdfName || 'cv.pdf',
    docxName: options.docxName || 'cv.docx',
  });
}

export { renderLetter } from './letter.js';
