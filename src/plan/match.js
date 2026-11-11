const GERMAN_MARKERS = new Set([
  'der', 'die', 'das', 'und', 'oder', 'sie', 'ihre', 'ihr', 'ihren', 'ihrem',
  'haben', 'hast', 'hat', 'wie', 'viele', 'viel', 'jahre', 'jahr', 'berufserfahrung',
  'erfahrung', 'kenntnisse', 'deutsch', 'englisch', 'verfuegbar', 'verfügbar',
  'gehalt', 'gehaltsvorstellung', 'gehaltsvorstellungen', 'bewerbung', 'arbeitserlaubnis',
  'bitte', 'geben', 'fuer', 'für', 'mit', 'von', 'im', 'ist', 'sind', 'nicht',
  'werden', 'koennen', 'können', 'muessen', 'müssen', 'wir', 'uns', 'einem',
  'einer', 'eines', 'zur', 'zum', 'auf', 'bei', 'nach', 'ueber', 'über',
  'unter', 'vor', 'waehrend', 'während', 'moechten', 'möchten', 'bereit',
  'umzuziehen', 'reisen', 'verfuegbar', 'anspruch', 'erlaubnis', 'status',
]);

const ENGLISH_MARKERS = new Set([
  'the', 'and', 'or', 'you', 'your', 'have', 'has', 'how', 'many', 'much',
  'years', 'year', 'experience', 'knowledge', 'available', 'availability',
  'salary', 'expectation', 'expectations', 'application', 'work', 'permit',
  'authorization', 'authorisation', 'please', 'with', 'from', 'is', 'are',
  'not', 'will', 'can', 'must', 'we', 'our', 'to', 'at', 'by', 'on', 'about',
  'during', 'willing', 'relocate', 'travel', 'require', 'sponsorship', 'notice',
]);

export function normalize(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function tokenize(text) {
  return normalize(text)
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

export function detectLanguage(text) {
  const tokens = tokenize(text);
  let de = 0;
  let en = 0;
  for (const t of tokens) {
    if (GERMAN_MARKERS.has(t)) de++;
    if (ENGLISH_MARKERS.has(t)) en++;
  }
  if (de === 0 && en === 0) return 'en';
  return de > en ? 'de' : 'en';
}

export function matchQuestion(questionText, entries) {
  const tokens = new Set(tokenize(questionText));
  const scored = [];

  for (const entry of entries) {
    const all = (entry.match?.all ?? []).map(normalize);
    const any = (entry.match?.any ?? []).map(normalize);

    if (all.length === 0 && any.length === 0) continue;
    if (!all.every((t) => tokens.has(t))) continue;

    const anyHits = any.filter((t) => tokens.has(t)).length;
    if (any.length > 0 && anyHits === 0) continue;

    scored.push({ entry, score: all.length * 10 + anyHits });
  }

  if (scored.length === 0) return { status: 'unknown', language: detectLanguage(questionText) };

  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  const tied = scored.filter((s) => s.score === best.score);

  if (tied.length > 1) {
    return {
      status: 'ambiguous',
      language: detectLanguage(questionText),
      candidates: tied.map((t) => t.entry.id),
    };
  }

  return {
    status: 'matched',
    entry: best.entry,
    score: best.score,
    language: detectLanguage(questionText),
  };
}

function toNumber(text) {
  // Strip thousands separators (spaces, commas used as grouping) then normalise decimal comma
  const cleaned = String(text).replace(/(\d)[,.\s](\d{3})(?=\D|$)/g, '$1$2').replace(',', '.');
  const m = cleaned.match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
}

function parseRange(label) {
  const s = normalize(label).replace(/\s+/g, ' ').trim();

  const between = s.match(/(\d+(?:\.\d+)?)\s*(?:-|–|—|to|bis)\s*(\d+(?:\.\d+)?)/);
  if (between) return [Number(between[1]), Number(between[2])];

  const less = s.match(/(?:less than|fewer than|under|below|weniger als|unter)\s*(\d+(?:\.\d+)?)/);
  if (less) return [0, Number(less[1]) - 1];

  const more = s.match(/(?:more than|over|above|mehr als|ueber|über)\s*(\d+(?:\.\d+)?)/);
  if (more) return [Number(more[1]) + 1, Infinity];

  const plus = s.match(/(\d+(?:\.\d+)?)\s*\+/);
  if (plus) return [Number(plus[1]), Infinity];

  const single = s.match(/^(\d+(?:\.\d+)?)$/);
  if (single) return [Number(single[1]), Number(single[1])];

  return null;
}

const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

// Synonyms mapping free-form language proficiency words to CEFR levels.
const CEFR_SYNONYMS = {
  A1: ['a1', 'beginner', 'keine', 'keine kenntnisse', 'none', 'elementary'],
  A2: ['a2', 'grundkenntnisse', 'basic'],
  B1: ['b1', 'gute kenntnisse', 'intermediate', 'good'],
  B2: ['b2', 'fliessend', 'fließend', 'upper intermediate', 'professional', 'advanced'],
  C1: ['c1', 'verhandlungssicher', 'fluent', 'proficient', 'business fluent'],
  C2: ['c2', 'native', 'bilingual', 'muttersprache', 'zweisprachig', 'mother tongue'],
};

function toCefrLevel(text) {
  const t = normalize(String(text ?? ''));
  // Direct CEFR code
  const codeMatch = t.match(/\b(a1|a2|b1|b2|c1|c2)\b/);
  if (codeMatch) return codeMatch[1].toUpperCase();
  // Synonym lookup
  for (const level of CEFR_LEVELS) {
    for (const syn of CEFR_SYNONYMS[level]) {
      if (t === syn || t.includes(syn)) return level;
    }
  }
  return null;
}

function optionCefrLevels(option) {
  const text = normalize((option.label ?? '') + ' ' + (option.value ?? ''));
  const levels = new Set();
  // Range like "a1 - b1" or "a1-b1" or "a1 – b1"
  const rangeMatch = text.match(/(a1|a2|b1|b2|c1|c2)\s*[-–—to]+\s*(a1|a2|b1|b2|c1|c2)/);
  if (rangeMatch) {
    const start = CEFR_LEVELS.indexOf(rangeMatch[1].toUpperCase());
    const end = CEFR_LEVELS.indexOf(rangeMatch[2].toUpperCase());
    if (start >= 0 && end >= 0) {
      for (let i = start; i <= end; i++) levels.add(CEFR_LEVELS[i]);
    }
  }
  // "c1+" / "c1 plus"
  if (/c1\s*\+/.test(text)) { levels.add('C1'); levels.add('C2'); }
  // Single CEFR code
  const single = text.match(/\b(a1|a2|b1|b2|c1|c2)\b/);
  if (single && levels.size === 0) levels.add(single[1].toUpperCase());
  // Synonym fallback for word-only options
  if (levels.size === 0) {
    for (const level of CEFR_LEVELS) {
      for (const syn of CEFR_SYNONYMS[level]) {
        if (text.includes(syn)) { levels.add(level); break; }
      }
    }
  }
  return levels;
}

export function resolveOption(desired, options) {
  const list = (options ?? []).filter((o) => String(o.value ?? '') !== '');
  if (list.length === 0) return { ok: false, reason: 'no-options' };

  const wantRaw = String(desired ?? '').trim();
  if (wantRaw === '') return { ok: false, reason: 'empty-value' };

  const wantNorm = normalize(wantRaw);

  // Language-proficiency matching: map a canonical level (e.g. "B2") to the
  // option whose CEFR band contains it (e.g. "B2 – C1 | Professional").
  const desiredLevel = toCefrLevel(wantRaw);
  if (desiredLevel) {
    const hits = list.filter((o) => optionCefrLevels(o).has(desiredLevel));
    if (hits.length === 1) return { ok: true, option: hits[0], how: 'language-level' };
    if (hits.length > 1) return { ok: false, reason: 'range-ambiguous', candidates: hits.map((o) => o.label) };
  }

  for (const o of list) {
    if (String(o.value) === wantRaw) return { ok: true, option: o, how: 'value-exact' };
  }
  for (const o of list) {
    if (String(o.label ?? '').trim() === wantRaw) return { ok: true, option: o, how: 'label-exact' };
  }
  for (const o of list) {
    if (normalize(o.label ?? '') === wantNorm) return { ok: true, option: o, how: 'label-normalized' };
  }
  for (const o of list) {
    if (normalize(o.value ?? '') === wantNorm) return { ok: true, option: o, how: 'value-normalized' };
  }

  const n = toNumber(wantRaw);
  if (n === null) return { ok: false, reason: 'no-match' };

  const hits = [];
  for (const o of list) {
    const range = parseRange(o.label ?? '') ?? parseRange(o.value ?? '');
    if (range && n >= range[0] && n <= range[1]) hits.push(o);
  }

  if (hits.length === 1) return { ok: true, option: hits[0], how: 'numeric-range' };
  if (hits.length > 1) return { ok: false, reason: 'range-ambiguous', candidates: hits.map((o) => o.label) };
  return { ok: false, reason: 'no-match' };
}
