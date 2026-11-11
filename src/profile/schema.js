export const PROFILE_SECTIONS = [
  'personal_information',
  'education_details',
  'experience_details',
  'projects',
  'achievements',
  'certifications',
  'languages',
  'interests',
  'availability',
  'salary_expectations',
  'self_identification',
  'legal_authorization',
  'work_preferences',
];

const ARRAY_SECTIONS = new Set([
  'education_details',
  'experience_details',
  'projects',
  'achievements',
  'certifications',
  'languages',
  'interests',
]);

const PERSONAL_STRING_FIELDS = [
  'first_name',
  'last_name',
  'email',
  'phone',
  'city',
  'country',
];

const CONFIDENCE = new Set(['high', 'medium', 'low']);

export function validateProfile(profile) {
  const errors = [];
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
    return { ok: false, errors: ['profile: expected an object'] };
  }

  for (const section of PROFILE_SECTIONS) {
    if (!(section in profile)) {
      errors.push(`profile: missing section "${section}"`);
      continue;
    }
    const v = profile[section];
    if (ARRAY_SECTIONS.has(section)) {
      if (!Array.isArray(v)) errors.push(`profile.${section}: expected an array`);
    } else if (typeof v !== 'object' || v === null || Array.isArray(v)) {
      errors.push(`profile.${section}: expected an object`);
    }
  }

  const pi = profile.personal_information;
  if (pi && typeof pi === 'object' && !Array.isArray(pi)) {
    for (const f of PERSONAL_STRING_FIELDS) {
      if (typeof pi[f] !== 'string' || pi[f].trim() === '') {
        errors.push(`profile.personal_information.${f}: expected a non-empty string`);
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

export function validateAnswers(answers) {
  const errors = [];
  if (!Array.isArray(answers)) {
    return { ok: false, errors: ['answers: expected an array'] };
  }

  const seen = new Set();

  answers.forEach((a, i) => {
    const at = `answers[${i}]`;
    if (!a || typeof a !== 'object' || Array.isArray(a)) {
      errors.push(`${at}: expected an object`);
      return;
    }

    if (typeof a.id !== 'string' || a.id.trim() === '') {
      errors.push(`${at}.id: expected a non-empty string`);
    } else {
      if (seen.has(a.id)) errors.push(`${at}.id: duplicate id "${a.id}"`);
      seen.add(a.id);
    }

    for (const lang of ['en', 'de']) {
      if (typeof a.question?.[lang] !== 'string') errors.push(`${at}.question.${lang}: expected a string`);
      if (typeof a.answer?.[lang] !== 'string') errors.push(`${at}.answer.${lang}: expected a string`);
    }

    const all = a.match?.all;
    const any = a.match?.any;
    if (!Array.isArray(all) || !Array.isArray(any)) {
      errors.push(`${at}.match: expected { all: [], any: [] }`);
    } else if (all.length === 0 && any.length === 0) {
      errors.push(`${at}.match: needs at least one token in all or any`);
    }

    if (typeof a.source !== 'string' || a.source.trim() === '') {
      errors.push(`${at}.source: expected a non-empty string`);
    }
    if (!CONFIDENCE.has(a.confidence)) {
      errors.push(`${at}.confidence: expected one of high|medium|low`);
    }
    if (typeof a.sensitive !== 'boolean') {
      errors.push(`${at}.sensitive: expected a boolean`);
    }
    if (Number.isNaN(Date.parse(a.approvedAt ?? ''))) {
      errors.push(`${at}.approvedAt: expected an ISO date`);
    }
    // Provenance fields (optional but validated when present)
    if (a.approved !== undefined && typeof a.approved !== 'boolean') {
      errors.push(`${at}.approved: expected a boolean`);
    }
    if (a.confirmedAt !== undefined && Number.isNaN(Date.parse(a.confirmedAt ?? ''))) {
      errors.push(`${at}.confirmedAt: expected an ISO date`);
    }
    if (a.requiresReview !== undefined && typeof a.requiresReview !== 'boolean') {
      errors.push(`${at}.requiresReview: expected a boolean`);
    }
  });

  return { ok: errors.length === 0, errors };
}
