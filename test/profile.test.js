import test from 'node:test';
import assert from 'node:assert/strict';
import { validateProfile, validateAnswers } from '../src/profile/schema.js';

const goodProfile = {
  personal_information: {
    first_name: 'Ada',
    last_name: 'Lovelace',
    email: 'ada@example.com',
    phone: '+49 30 000000',
    city: 'Berlin',
    country: 'Germany',
  },
  education_details: [],
  experience_details: [],
  projects: [],
  achievements: [],
  certifications: [],
  languages: [],
  interests: [],
  availability: {},
  salary_expectations: {},
  self_identification: {},
  legal_authorization: {},
  work_preferences: {},
};

const goodAnswer = {
  id: 'years-javascript',
  question: { en: 'Years of JavaScript?', de: 'Jahre JavaScript?' },
  match: { all: ['javascript'], any: ['years', 'jahre'] },
  answer: { en: '6', de: '6' },
  source: 'cv:foo.pdf',
  confidence: 'high',
  sensitive: false,
  approvedAt: '2026-11-08T12:00:00.000Z',
};

test('accepts a complete profile', () => {
  const r = validateProfile(goodProfile);
  assert.equal(r.ok, true, JSON.stringify(r.errors));
});

test('rejects a profile missing a section', () => {
  const p = structuredClone(goodProfile);
  delete p.legal_authorization;
  const r = validateProfile(p);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('legal_authorization')));
});

test('rejects a non-object profile', () => {
  assert.equal(validateProfile(null).ok, false);
  assert.equal(validateProfile([]).ok, false);
});

test('rejects a profile with a non-string email', () => {
  const p = structuredClone(goodProfile);
  p.personal_information.email = 42;
  const r = validateProfile(p);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('personal_information.email')));
});

test('rejects an array where an object section is expected', () => {
  const p = structuredClone(goodProfile);
  p.legal_authorization = [];
  const r = validateProfile(p);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('legal_authorization')));
});

test('accepts a well-formed answer entry', () => {
  const r = validateAnswers([goodAnswer]);
  assert.equal(r.ok, true, JSON.stringify(r.errors));
});

test('rejects an answer entry with no match tokens', () => {
  const a = structuredClone(goodAnswer);
  a.match = { all: [], any: [] };
  const r = validateAnswers([a]);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('match')));
});

test('rejects duplicate answer ids', () => {
  const r = validateAnswers([goodAnswer, structuredClone(goodAnswer)]);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('duplicate')));
});

test('rejects a missing German answer', () => {
  const a = structuredClone(goodAnswer);
  delete a.answer.de;
  const r = validateAnswers([a]);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('answer.de')));
});

test('rejects an invalid confidence level', () => {
  const a = structuredClone(goodAnswer);
  a.confidence = 'certain';
  const r = validateAnswers([a]);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('confidence')));
});

test('rejects an unparseable approvedAt', () => {
  const a = structuredClone(goodAnswer);
  a.approvedAt = 'yesterday';
  const r = validateAnswers([a]);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('approvedAt')));
});
