import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { sha256 } from '../util/hash.js';

export function createAudit(path, { now = () => new Date() } = {}) {
  return {
    record(entry) {
      const row = { ts: now().toISOString(), ...entry };
      if (entry.sensitive === true && entry.value !== undefined) {
        row.valueHash = sha256(String(entry.value));
        delete row.value;
      }
      mkdirSync(dirname(path), { recursive: true });
      appendFileSync(path, JSON.stringify(row) + '\n', { encoding: 'utf8', flag: 'a' });
      return row;
    },
  };
}
