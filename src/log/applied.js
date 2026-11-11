import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * Append one application record to the applied-jobs log.
 * @param {string} path - path to applied.jsonl
 * @param {object} entry - application record (job, company, status, etc.)
 * @param {() => Date} [now]
 */
export function appendApplied(path, entry, now = () => new Date()) {
  const row = { ts: now().toISOString(), ...entry };
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, JSON.stringify(row) + '\n', { encoding: 'utf8', flag: 'a' });
  return row;
}

/**
 * Read all application records from the log.
 * @param {string} path
 * @returns {Array<object>}
 */
export function readApplied(path) {
  let raw;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
  return raw
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line, i) => {
      try { return JSON.parse(line); }
      catch { throw new Error(`applied.jsonl line ${i + 1} is not valid JSON`); }
    });
}
