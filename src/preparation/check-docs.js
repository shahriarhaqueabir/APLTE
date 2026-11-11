// src/preparation/check-docs.js
// Cross-reference gate for tailored CV/cover-letter markdown.
// Verifies structure rules and traceability against MASTER_CV.md (via cv-sections.json)
// and the research files. Returns { ok, failures[], warnings[] }.

import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';

function sha256(s) { return createHash('sha256').update(String(s), 'utf8').digest('hex'); }
function readJson(p) { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } }

// Personal identifiers (name, city, country, institution) are personal data.
// They must never be hardcoded in source: read them from the gitignored
// data/profile.json, or from JOBBOT_CANDIDATE_NAME when running elsewhere.
// Returns { phrases, tokens }: phrases match as substrings (so a middle name
// still matches the profile's first+last name), tokens match whole words.
function personalTerms() {
  const phrases = [];
  const tokens = new Set();
  const addPhrase = (value) => {
    const phrase = String(value || '').trim();
    if (!phrase) return;
    phrases.push(phrase);
    for (const part of phrase.split(/\s+/)) if (part.length > 2) tokens.add(part);
  };
  const profile = readJson(join(process.cwd(), 'data', 'profile.json'));
  const info = profile?.personal_information || {};
  addPhrase([info.first_name, info.last_name].filter(Boolean).join(' '));
  addPhrase(info.city);
  addPhrase(info.country);
  const education = Array.isArray(profile?.education_details) ? profile.education_details : [];
  for (const entry of education) if (entry) addPhrase(entry.institution);
  if (process.env.JOBBOT_CANDIDATE_NAME) addPhrase(process.env.JOBBOT_CANDIDATE_NAME);
  return { phrases: phrases.map(p => p.toLowerCase()), tokens };
}

const CV_STRUCTURE = [
  { name: 'no_yaml_front_matter', test: (md) => !(md.trimStart().startsWith('---\n') || md.trimStart().startsWith('---\r\n')) },
  { name: 'no_thematic_break_divider', test: (md) => !/^\s*---\s*$/m.test(md) },
  { name: 'no_html_tags', test: (md) => !/<[a-zA-Z][^>]*>/.test(md) },
  { name: 'no_space_padded_alignment', test: (md) => !/ {3,}\S/.test(md) && !/\t/.test(md) },
  { name: 'has_h1_title', test: (md) => /^#\s+.+/m.test(md) },
  { name: 'has_sections', test: (md) => (md.match(/^##\s+/gm) || []).length >= 3 },
];

const CL_STRUCTURE = [
  { name: 'no_yaml_front_matter', test: (md) => !(md.trimStart().startsWith('---\n') || md.trimStart().startsWith('---\r\n')) },
  { name: 'no_thematic_break_divider', test: (md) => !/^\s*---\s*$/m.test(md) },
  { name: 'no_html_tags', test: (md) => !/<[a-zA-Z][^>]*>/.test(md) },
  { name: 'no_space_padded_alignment', test: (md) => !/ {3,}\S/.test(md) && !/\t/.test(md) },
  { name: 'has_h1_title', test: (md) => /^#\s+.+/m.test(md) },
];

export function checkStructure(md, label, isCv) {
  const rules = isCv ? CV_STRUCTURE : CL_STRUCTURE;
  const failures = [];
  for (const c of rules) {
    if (!c.test(md)) failures.push(`${label}: structure violation '${c.name}'`);
  }
  return failures;
}

export function extractNumbers(md) {
  const matches = md.match(/~?\d[\d.,]*%?/g) || [];
  return [...new Set(matches)];
}

// Proper nouns on a single line only (no cross-line matching)
function extractProperNouns(md) {
  const out = new Set();
  for (const line of md.split(/\r?\n/)) {
    const matches = line.match(/\b[A-Z][a-zA-Z]+(?:[ \t]+[A-Z][a-zA-Z]+)+\b/g) || [];
    for (const m of matches) out.add(m.trim());
  }
  return [...out];
}

export function checkTraceability(tailoredMd, sourceText, label, allowedTerms) {
  const failures = [];
  const allowed = new Set((allowedTerms || []).map(t => t.toLowerCase()));
  // Numbers must appear in source
  const nums = extractNumbers(tailoredMd);
  for (const n of nums) {
    const core = n.replace(/^~/, '');
    if (!sourceText.includes(core)) {
      failures.push(`${label}: number '${n}' not found in MASTER_CV.md (possible fabrication)`);
    }
  }
  // Proper nouns must appear in source OR be an allowed transferable term.
  // Candidate-specific identifiers are resolved at runtime (see personalTerms).
  const nouns = extractProperNouns(tailoredMd);
  const personal = personalTerms();
  const isPersonal = (noun) => {
    const lower = noun.toLowerCase();
    if (personal.phrases.some(p => lower.includes(p))) return true;
    return !/\s/.test(noun) && personal.tokens.has(noun);
  };
  const GENERIC_TERMS = new Set(['DACH', 'North America', 'APAC', 'CompTIA', 'Cisco', 'Goethe', 'Linux', 'Foundation', 'North', 'South', 'University', 'PROFESSIONAL PROFILE', 'CORE COMPETENCIES', 'PROFESSIONAL EXPERIENCE', 'SELECTED PROJECTS', 'EDUCATION', 'TECHNICAL SKILLS', 'CERTIFICATIONS', 'LANGUAGES']);
  for (const pn of nouns) {
    if (isPersonal(pn)) continue;
    if (GENERIC_TERMS.has(pn)) continue;
    if (allowed.has(pn.toLowerCase())) continue;
    if (!sourceText.includes(pn)) {
      failures.push(`${label}: proper noun '${pn}' not found in MASTER_CV.md (possible fabrication or unverified claim)`);
    }
  }
  return failures;
}

export function checkCompanyClaims(clMd, researchText, jobTitle, company) {
  const failures = [];
  if (company && !clMd.includes(company)) {
    failures.push(`cover-letter: does not mention company name '${company}'`);
  }
  const kwMatch = researchText.match(/## Keywords\s*\n([\s\S]*?)(?=\n##|\n$)/i);
  if (kwMatch) {
    const keywords = kwMatch[1].split(/[,\n]/).map(k => k.trim().toLowerCase()).filter(k => k.length > 3);
    const clLower = clMd.toLowerCase();
    const hit = keywords.filter(k => clLower.includes(k));
    if (hit.length < 3) {
      failures.push(`cover-letter: only ${hit.length} job keywords found (need >=3). Missing coverage.`);
    }
  }
  if (jobTitle && !clMd.toLowerCase().includes(jobTitle.toLowerCase().split('(')[0].trim().toLowerCase())) {
    // soft: just warn-level, not failure
  }
  return failures;
}

export function checkDocs(folder) {
  const root = resolve(folder);
  const failures = [];
  const warnings = [];
  const files = {
    cv: join(root, 'source', 'cv.md'),
    cl: join(root, 'source', 'cover-letter.md'),
    jd: join(root, 'research', 'job-description.md'),
    cr: join(root, 'research', 'company-research.md'),
    sections: join(process.cwd(), 'data', 'cv-sections.json'),
  };

  for (const [k, p] of Object.entries(files)) {
    if (k === 'sections') continue;
    if (!existsSync(p)) { failures.push(`missing file: ${p}`); return { ok: false, failures, warnings }; }
  }
  if (!existsSync(files.sections)) {
    warnings.push('data/cv-sections.json not found; run "node tools/segment-cv.js" first. Using MASTER_CV.md directly.');
  }

  const cvMd = readFileSync(files.cv, 'utf8');
  const clMd = readFileSync(files.cl, 'utf8');
  const jdText = readFileSync(files.jd, 'utf8');
  const crText = readFileSync(files.cr, 'utf8');
  const researchText = jdText + '\n' + crText;

  // Extract job title and company from job-description.md
  const titleMatch = jdText.match(/\*\*Role:\*\*\s*(.+)/i) || jdText.match(/Role:\s*(.+)/i);
  const jobTitle = titleMatch ? titleMatch[1].trim() : '';
  const companyMatch = jdText.match(/\*\*Company:\*\*\s*(.+)/i) || jdText.match(/Company:\s*(.+)/i);
  const company = companyMatch ? companyMatch[1].trim() : '';

  // Allowed transferable terms = job title words + keywords from research
  const allowedTerms = [];
  if (jobTitle) {
    allowedTerms.push(jobTitle);
    allowedTerms.push(jobTitle.replace(/\(.*?\)/g, '').trim());
    allowedTerms.push(...jobTitle.split(/\s+/));
  }
  const kwMatch = researchText.match(/## Keywords\s*\n([\s\S]*?)(?=\n##|\n$)/i);
  if (kwMatch) allowedTerms.push(...kwMatch[1].split(/[,\n]/).map(k => k.trim()).filter(Boolean));

  let sourceText = '';
  if (existsSync(files.sections)) {
    const sec = readJson(files.sections);
    sourceText = sec?.flatText || '';
  } else {
    const mc = join(process.cwd(), 'CVs', 'MASTER_CV.md');
    if (existsSync(mc)) sourceText = readFileSync(mc, 'utf8');
  }

  failures.push(...checkStructure(cvMd, 'cv', true));
  failures.push(...checkStructure(clMd, 'cover-letter', false));
  failures.push(...checkTraceability(cvMd, sourceText, 'cv', allowedTerms));
  // CL traceability: only check numbers (metrics) against source; company claims checked separately
  const clNums = extractNumbers(clMd);
  for (const n of clNums) {
    const core = n.replace(/^~/, '');
    if (!sourceText.includes(core) && !researchText.includes(core)) {
      failures.push(`cover-letter: number '${n}' not found in MASTER_CV or research (possible fabrication)`);
    }
  }
  failures.push(...checkCompanyClaims(clMd, researchText, jobTitle, company));

  const clWords = clMd.split(/\s+/).filter(Boolean).length;
  if (clWords < 200 || clWords > 400) {
    warnings.push(`cover-letter word count ${clWords} (target 250-350)`);
  }

  return { ok: failures.length === 0, failures, warnings, jobTitle, company };
}
