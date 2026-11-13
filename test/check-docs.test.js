import test from 'node:test';
import assert from 'node:assert/strict';
import { checkStructure, CV_SECTION_ORDER } from '../src/preparation/check-docs.js';

function cv(headings) {
  return ['# Jane Doe', '', 'contact@example.com', '']
    .concat(headings.flatMap((h) => ['## ' + h, '', 'Content.', '']))
    .join('\n');
}

const FULL = [
  'PROFESSIONAL PROFILE',
  'CORE COMPETENCIES',
  'TECHNICAL SKILLS',
  'PROFESSIONAL EXPERIENCE',
  'EDUCATION',
  'CERTIFICATIONS',
  'LANGUAGES',
];

test('canonical CV section order is accepted', () => {
  const failures = checkStructure(cv(FULL), 'cv', true);
  assert.deepEqual(failures, []);
});

test('SELECTED PROJECTS is optional and sits second-to-last when present', () => {
  const withProjects = [
    'PROFESSIONAL PROFILE',
    'CORE COMPETENCIES',
    'TECHNICAL SKILLS',
    'PROFESSIONAL EXPERIENCE',
    'EDUCATION',
    'CERTIFICATIONS',
    'SELECTED PROJECTS',
    'LANGUAGES',
  ];
  assert.deepEqual(checkStructure(cv(withProjects), 'cv', true), []);
  assert.equal(CV_SECTION_ORDER.at(-2), 'SELECTED PROJECTS');
  assert.equal(CV_SECTION_ORDER.at(-1), 'LANGUAGES');
});

test('technical skills before experience is required', () => {
  const legacy = [
    'PROFESSIONAL PROFILE',
    'CORE COMPETENCIES',
    'PROFESSIONAL EXPERIENCE',
    'EDUCATION',
    'TECHNICAL SKILLS',
    'CERTIFICATIONS',
    'LANGUAGES',
  ];
  const failures = checkStructure(cv(legacy), 'cv', true);
  assert.deepEqual(failures, ["cv: structure violation 'section_order'"]);
});

test('cover letters are not subject to the CV section order', () => {
  const md = '# Jane Doe\n\nHello.\n\n## Anything\n\nBody.\n';
  assert.deepEqual(checkStructure(md, 'cover-letter', false), []);
});
