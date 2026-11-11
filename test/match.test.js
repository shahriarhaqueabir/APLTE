import test from 'node:test';
import assert from 'node:assert/strict';
import { normalize, tokenize, detectLanguage, matchQuestion, resolveOption } from '../src/plan/match.js';

const entries = [
  {
    id: 'years-javascript',
    match: { all: ['javascript'], any: ['years', 'experience', 'jahre', 'erfahrung'] },
    answer: { en: '6', de: '6' },
  },
  {
    id: 'years-java',
    match: { all: ['java'], any: ['years', 'jahre'] },
    answer: { en: '4', de: '4' },
  },
  {
    id: 'work-permit',
    match: { all: ['work'], any: ['permit', 'authorization', 'erlaubnis', 'arbeitserlaubnis'] },
    answer: { en: 'Yes', de: 'Ja' },
  },
];

test('normalize strips case, diacritics and eszett', () => {
  assert.equal(normalize('Größe'), 'grosse');
  assert.equal(normalize('ÜBER'), 'uber');
});

test('tokenize splits on non-alphanumerics', () => {
  assert.deepEqual(tokenize('How many years? 3-5'), ['how', 'many', 'years', '3', '5']);
});

test('detectLanguage finds English', () => {
  assert.equal(detectLanguage('How many years of experience do you have?'), 'en');
});

test('detectLanguage finds German', () => {
  assert.equal(detectLanguage('Wie viele Jahre Erfahrung haben Sie mit JavaScript?'), 'de');
});

test('detectLanguage defaults to English when there are no markers', () => {
  assert.equal(detectLanguage('JavaScript'), 'en');
});

test('matches a JavaScript question to the JavaScript entry', () => {
  const r = matchQuestion('How many years of JavaScript experience do you have?', entries);
  assert.equal(r.status, 'matched');
  assert.equal(r.entry.id, 'years-javascript');
  assert.equal(r.language, 'en');
});

test('does not match java to a javascript question', () => {
  const r = matchQuestion('How many years of JavaScript experience do you have?', entries);
  assert.notEqual(r.entry.id, 'years-java');
});

test('does not match javascript to a java question', () => {
  const r = matchQuestion('How many years of Java experience do you have?', entries);
  assert.equal(r.entry.id, 'years-java');
});

test('matches a German question and reports German', () => {
  const r = matchQuestion('Wie viele Jahre Erfahrung haben Sie mit JavaScript?', entries);
  assert.equal(r.status, 'matched');
  assert.equal(r.entry.id, 'years-javascript');
  assert.equal(r.language, 'de');
});

test('returns unknown when nothing matches', () => {
  const r = matchQuestion('Do you have a driving licence?', entries);
  assert.equal(r.status, 'unknown');
});

test('returns ambiguous on a tie', () => {
  const tied = [
    { id: 'a', match: { all: ['python'], any: [] }, answer: { en: '1', de: '1' } },
    { id: 'b', match: { all: ['python'], any: [] }, answer: { en: '2', de: '2' } },
  ];
  const r = matchQuestion('Years of Python', tied);
  assert.equal(r.status, 'ambiguous');
  assert.deepEqual(r.candidates.sort(), ['a', 'b']);
});

test('prefers the more specific match', () => {
  const specific = [
    { id: 'general', match: { all: ['experience'], any: [] }, answer: { en: 'x', de: 'x' } },
    { id: 'specific', match: { all: ['javascript', 'experience'], any: [] }, answer: { en: 'y', de: 'y' } },
  ];
  const r = matchQuestion('How much JavaScript experience do you have?', specific);
  assert.equal(r.entry.id, 'specific');
});

test('resolveOption matches a label exactly', () => {
  const opts = [{ value: 'y', label: 'Yes' }, { value: 'n', label: 'No' }];
  const r = resolveOption('Yes', opts);
  assert.equal(r.ok, true);
  assert.equal(r.option.value, 'y');
});

test('resolveOption matches case-insensitively', () => {
  const opts = [{ value: 'y', label: 'Yes' }, { value: 'n', label: 'No' }];
  assert.equal(resolveOption('yes', opts).option.value, 'y');
});

test('resolveOption picks the numeric range that contains the answer', () => {
  const opts = [
    { value: 'a', label: '0-1 years' },
    { value: 'b', label: '2-5 years' },
    { value: 'c', label: '6-10 years' },
    { value: 'd', label: 'More than 10 years' },
  ];
  assert.equal(resolveOption('6', opts).option.value, 'c');
  assert.equal(resolveOption('3', opts).option.value, 'b');
  assert.equal(resolveOption('15', opts).option.value, 'd');
});

test('resolveOption handles German range wording', () => {
  const opts = [
    { value: 'a', label: 'Weniger als 1 Jahr' },
    { value: 'b', label: '1 bis 3 Jahre' },
    { value: 'c', label: 'Mehr als 3 Jahre' },
  ];
  assert.equal(resolveOption('2', opts).option.value, 'b');
  assert.equal(resolveOption('5', opts).option.value, 'c');
});

test('resolveOption reports ambiguity rather than guessing', () => {
  const opts = [
    { value: 'a', label: '3-5 years' },
    { value: 'b', label: '3-7 years' },
  ];
  const r = resolveOption('4', opts);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'range-ambiguous');
});

test('resolveOption ignores empty-value placeholder options', () => {
  const opts = [{ value: '', label: 'Select an option' }, { value: 'y', label: 'Yes' }];
  assert.equal(resolveOption('Yes', opts).option.value, 'y');
});

test('resolveOption returns no-match for a free-text answer on a dropdown', () => {
  const opts = [{ value: 'y', label: 'Yes' }, { value: 'n', label: 'No' }];
  const r = resolveOption('maybe', opts);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'no-match');
});
