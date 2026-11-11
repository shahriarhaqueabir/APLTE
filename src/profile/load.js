import { readFileSync } from 'node:fs';
import { validateProfile, validateAnswers } from './schema.js';

function readJson(path) {
  let raw;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (err) {
    const why = err.code === 'ENOENT' ? 'file not found' : err.message;
    throw new Error(`cannot read ${path}: ${why}`);
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`${path} is not valid JSON: ${err.message}`);
  }
}

function assertValid(result, path) {
  if (!result.ok) {
    throw new Error(`${path} failed validation:\n  - ${result.errors.join('\n  - ')}`);
  }
}

export function loadProfile(path) {
  const data = readJson(path);
  assertValid(validateProfile(data), path);
  return data;
}

export function loadAnswers(path) {
  const data = readJson(path);
  assertValid(validateAnswers(data), path);
  return data;
}
