import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPlan, summarisePlan } from '../src/plan/build.js';
import { pageHash } from '../src/util/hash.js';

const answers = [
  {
    id: 'city',
    match: { all: [], any: ['city', 'stadt', 'wohnen'] },
    answer: { en: 'Berlin', de: 'Berlin' },
    source: 'profile',
    confidence: 'high',
    sensitive: false,
    approvedAt: '2026-11-08T12:00:00.000Z',
  },
  {
    id: 'german-level',
    match: { all: [], any: ['deutsch', 'deutschkenntnisse', 'german'] },
    answer: { en: 'B2', de: 'B2' },
    source: 'profile',
    confidence: 'high',
    sensitive: false,
    approvedAt: '2026-11-08T12:00:00.000Z',
  },
];

test('buildPlan matches fields and produces fills', () => {
  const scan = {
    title: 'Test Job',
    pageIndicator: { current: 1, total: 2 },
    fields: [
      { key: 'f0', label: 'In which city do you live?', type: 'text', required: false, value: '' },
      { key: 'f1', label: 'Wie gut sind Ihre Deutschkenntnisse?', type: 'radio', required: true, value: '', options: [{ value: 'a', label: 'Fließend' }, { value: 'b', label: 'Grundkenntnisse' }] },
    ],
    buttons: ['Next', 'Back'],
  };
  const plan = buildPlan(scan, answers, { now: 1000 });
  assert.equal(plan.fills.length, 2);
  assert.equal(plan.unknowns.length, 0);
  assert.equal(plan.ambiguities.length, 0);
  assert.equal(plan.createdAt, 1000);
  assert.equal(plan.advanceButton, 'Next');
  assert.equal(plan.fills[0].value, 'Berlin');
  assert.equal(plan.fills[1].value, 'a'); // resolved to Fließend option
  assert.equal(plan.fills[1].resolution.how, 'language-level');
});

test('buildPlan reports unknowns', () => {
  const scan = {
    title: 'Test',
    fields: [
      { key: 'f0', label: 'Do you have a driving licence?', type: 'text', required: false, value: '' },
    ],
    buttons: ['Next'],
  };
  const plan = buildPlan(scan, answers);
  assert.equal(plan.fills.length, 0);
  assert.equal(plan.unknowns.length, 1);
});

test('buildPlan handles empty scan', () => {
  const plan = buildPlan({ fields: [], buttons: [] }, answers);
  assert.equal(plan.fills.length, 0);
  assert.equal(plan.unknowns.length, 0);
  assert.equal(plan.advanceButton, null);
});

test('summarisePlan produces readable output', () => {
  const scan = {
    title: 'Test Job',
    pageIndicator: { current: 1, total: 2 },
    fields: [
      { key: 'f0', label: 'In which city do you live?', type: 'text', required: false, value: '' },
    ],
    buttons: ['Next', 'Back'],
  };
  const plan = buildPlan(scan, answers);
  const summary = summarisePlan(plan);
  assert.ok(summary.includes('Test Job'));
  assert.ok(summary.includes('Matched: 1'));
  assert.ok(summary.includes('Next'));
});
