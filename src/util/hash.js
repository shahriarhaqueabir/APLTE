import { createHash } from 'node:crypto';

export function canonicalize(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalize).join(',') + ']';
  const keys = Object.keys(value).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalize(value[k])).join(',') + '}';
}

export function sha256(text) {
  return createHash('sha256').update(String(text), 'utf8').digest('hex');
}

export function pageHash(fields) {
  // Structure-only: key, label, type, required, options. Value is intentionally
  // excluded so user edits mid-run do not void the plan (spec §4.5).
  const projection = fields.map((f) => ({
    key: f.key,
    label: f.label,
    type: f.type,
    required: Boolean(f.required),
    options: Array.isArray(f.options) ? f.options.map((o) => o.value) : null,
  }));
  return sha256(canonicalize(projection));
}
