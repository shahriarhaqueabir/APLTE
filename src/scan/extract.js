// src/scan/extract.js
// Extracts Easy Apply form fields from the open modal into structured descriptors.
// Everything here must be self-contained: the extraction runs inside the browser
// via driver.executeScript, so it cannot reference Node modules or outer scope.

export const EXTRACT_SOURCE = null; // placeholder for compatibility

function extractInPage() {
  // All helpers must be defined INSIDE this function (self-contained for executeScript)
  function toText(v) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim(); }

  function isRequired(el, label) {
    if (el.hasAttribute && el.hasAttribute('required')) return true;
    if (el.getAttribute && el.getAttribute('aria-required') === 'true') return true;
    return /\*$/.test(String(label || '').trim());
  }

  function findLabel(el) {
    const id = el.getAttribute && el.getAttribute('id');
    if (id) {
      try {
        const lbl = document.querySelector('label[for="' + CSS.escape(id) + '"]');
        if (lbl) return toText(lbl.innerText);
      } catch (e) {}
    }
    const lb = el.getAttribute && el.getAttribute('aria-labelledby');
    if (lb) {
      const ref = document.getElementById(lb);
      if (ref) return toText(ref.innerText);
    }
    const aria = el.getAttribute && el.getAttribute('aria-label');
    if (aria) return toText(aria);
    let node = el.parentElement;
    for (let i = 0; i < 6 && node; i++) {
      if (node.innerText && node.innerText.trim().length > 0 && node.innerText.trim().length < 200) {
        const t = toText(node.innerText);
        if (t && t.length > 2) return t;
      }
      node = node.parentElement;
    }
    return '';
  }

  function isContactLine(line) {
    return /@|linkedin\.com|github\.com|\+49|\+\d{2}|Niederlassungserlaubnis|Work authorisation|Languages:/i.test(line);
  }

  function isExperienceEntry(line) {
    return /^[A-Z].*[—–-].*\|.*\d{4}/.test(line);
  }

  function detectSections(dialog) {
    const sections = [];
    const headings = Array.from(dialog.querySelectorAll('h1, h2, h3, [class*="title"], [class*="header"], [class*="section"]'));
    for (const h of headings) {
      const label = toText(h.innerText);
      if (label && label.length > 1 && label.length < 120) {
        sections.push(label);
      }
    }
    return [...new Set(sections)];
  }

  function findSectionForElement(el, sections, dialog) {
    if (!sections || sections.length === 0) return null;
    let node = el;
    for (let i = 0; i < 15 && node && node !== dialog; i++) {
      let prev = node.previousElementSibling;
      while (prev) {
        const tag = (prev.tagName || '').toLowerCase();
        if (tag === 'h1' || tag === 'h2' || tag === 'h3' || tag === 'legend' || (prev.getAttribute && prev.getAttribute('role') === 'heading')) {
          const text = toText(prev.innerText);
          if (text && sections.includes(text)) return text;
        }
        prev = prev.previousElementSibling;
      }
      node = node.parentElement;
    }
    return sections.length > 0 ? sections[0] : null;
  }

  function classifyState(dialog, fields, buttons) {
    const headings = Array.from(dialog.querySelectorAll('h1,h2,h3,[class*="title"],[class*="header"]'))
      .map((h) => toText(h.innerText).toLowerCase())
      .filter(Boolean);
    const btnLabels = buttons.map((b) => b.toLowerCase());
    const fieldLabels = fields.map((f) => (f.label || '').toLowerCase());
    const text = (dialog.innerText || '').toLowerCase();

    if (/captcha|security check|unusual activity|verify you are human/.test(text)) return 'CHALLENGE';
    const hasContact = fieldLabels.some((l) => /first name|last name|phone|email|location|contact/i.test(l));
    const hasResume = fieldLabels.some((l) => /resume|cv/i.test(l)) || text.includes('upload resume') || text.includes('select or upload');
    const hasCoverLetter = fieldLabels.some((l) => /cover letter/i.test(l)) || text.includes('cover letter');
    const hasAdditionalQ = fieldLabels.some((l) => /start date|salary|language|proficiency|work authorization|sponsorship|relocate|experience/i.test(l));
    const hasTopChoice = fieldLabels.some((l) => /top choice/i.test(l)) || text.includes('top choice');
    const hasReview = text.includes('review your application') || text.includes('review application');
    const hasSubmit = btnLabels.some((b) => /submit|send|absenden|abschicken/i.test(b));

    if (hasReview || hasSubmit) return 'REVIEW';
    if (hasTopChoice && !hasAdditionalQ && !hasContact) return 'VOLUNTARY_INFORMATION';
    if (hasContact && !hasResume && !hasAdditionalQ) return 'PERSONAL_DETAILS';
    if (hasResume && !hasAdditionalQ && !hasContact) return 'RESUME_SELECTION';
    if (hasAdditionalQ) return 'SCREENING_QUESTIONS';
    if (hasContact && hasResume) return 'PERSONAL_DETAILS';
    if (btnLabels.some((b) => /easy apply/i.test(b))) return 'APPLICATION_START';
    return 'UNKNOWN_STATE';
  }

  // --- Main extraction ---
  const dialog = document.querySelector('dialog, [role="dialog"], .artdeco-modal, .jobs-easy-apply-content');
  if (!dialog) return { error: 'no-modal', fields: [], pageIndicator: null, title: document.title, url: location.href, domain: location.hostname, jobId: null, modalId: null, stage: null, buttons: [], sections: [], state: 'NO_DIALOG' };

  const url = location.href;
  const domain = location.hostname;

  let jobId = null;
  try {
    const params = new URLSearchParams(location.search);
    jobId = params.get('currentJobId');
    if (!jobId) {
      const m = location.pathname.match(/\/jobs\/view\/(\d+)/);
      if (m) jobId = m[1];
    }
  } catch (e) {}

  const modalId = dialog.getAttribute('data-test-modal') || dialog.getAttribute('id') || (dialog.className ? dialog.className.split(' ')[0] : null);

  const pageMatch = (dialog.innerText || '').match(/(\d+)\s*\/\s*(\d+)\s*pages?/i);
  const pageIndicator = pageMatch ? { current: Number(pageMatch[1]), total: Number(pageMatch[2]) } : null;
  const stage = pageIndicator ? (pageIndicator.current + '/' + pageIndicator.total) : null;

  const titleEl = dialog.querySelector('h1, h2, h3');
  const title = titleEl ? toText(titleEl.innerText).slice(0, 120) : null;

  const sections = detectSections(dialog);

  const fields = [];
  let keyCounter = 0;
  const nextKey = () => 'f' + (keyCounter++);

  // Text-like inputs
  const textInputs = Array.from(dialog.querySelectorAll('input[type="text"], input[type="tel"], input[type="email"], input[type="url"], input[type="number"], input[type="date"], input:not([type])'))
    .filter((el) => el.type !== 'radio' && el.type !== 'checkbox');
  for (const el of textInputs) {
    const label = findLabel(el);
    fields.push({
      key: nextKey(),
      label: label,
      type: el.type === 'tel' ? 'tel' : (el.type === 'email' ? 'email' : (el.type === 'url' ? 'url' : (el.type === 'number' ? 'number' : (el.type === 'date' ? 'date' : 'text')))),
      required: isRequired(el, label),
      value: el.value || '',
      options: null,
      inputType: el.getAttribute('data-testid') || el.type || 'text',
      section: findSectionForElement(el, sections, dialog),
    });
  }

  // Selects
  const selects = Array.from(dialog.querySelectorAll('select'));
  for (const el of selects) {
    const label = findLabel(el);
    const opts = Array.from(el.options).map((o) => ({ value: o.value, label: toText(o.text) }));
    fields.push({
      key: nextKey(),
      label: label,
      type: 'select',
      required: isRequired(el, label),
      value: el.value || '',
      options: opts,
      inputType: 'select',
      section: findSectionForElement(el, sections, dialog),
    });
  }

  // Radio groups
  const radios = Array.from(dialog.querySelectorAll('input[type="radio"]'));
  const groups = {};
  let syntheticKey = 0;
  for (const r of radios) {
    const name = r.getAttribute('name') || r.getAttribute('id') || ('radio_' + (syntheticKey++));
    if (!groups[name]) groups[name] = [];
    groups[name].push(r);
  }
  for (const [name, group] of Object.entries(groups)) {
    const first = group[0];
    const label = findLabel(first);
    const opts = group.map((r) => {
      let optLabel = '';
      let node = r.parentElement;
      for (let i = 0; i < 5 && node; i++) {
        const t = toText(node.innerText);
        if (t && t.length > 1 && t.length < 120) { optLabel = t; break; }
        node = node.parentElement;
      }
      if (!optLabel) optLabel = r.getAttribute('aria-label') || r.getAttribute('value') || '';
      return { value: r.getAttribute('value') || '', label: toText(optLabel), checked: r.checked };
    });
    const checkedOpt = opts.find((o) => o.checked);
    fields.push({
      key: nextKey(),
      label: label,
      type: 'radio',
      required: isRequired(first, label),
      value: checkedOpt ? checkedOpt.value : '',
      options: opts.map((o) => ({ value: o.value, label: o.label })),
      inputType: 'radio',
      section: findSectionForElement(first, sections, dialog),
    });
  }

  // Checkboxes
  const checkboxes = Array.from(dialog.querySelectorAll('input[type="checkbox"]'));
  for (const el of checkboxes) {
    const label = findLabel(el);
    fields.push({
      key: nextKey(),
      label: label,
      type: 'checkbox',
      required: isRequired(el, label),
      value: el.checked ? 'true' : 'false',
      options: null,
      inputType: 'checkbox',
      section: findSectionForElement(el, sections, dialog),
    });
  }

  // Textareas
  const textareas = Array.from(dialog.querySelectorAll('textarea'));
  for (const el of textareas) {
    const label = findLabel(el);
    fields.push({
      key: nextKey(),
      label: label,
      type: 'textarea',
      required: isRequired(el, label),
      value: el.value || '',
      options: null,
      inputType: 'textarea',
      section: findSectionForElement(el, sections, dialog),
    });
  }

  // Detect buttons
  const buttons = Array.from(dialog.querySelectorAll('button'));
  const buttonLabels = buttons.map((b) => toText(b.innerText)).filter(Boolean);

  // Classify state
  const state = classifyState(dialog, fields, buttonLabels);

  return {
    error: null,
    title: title,
    url: url,
    domain: domain,
    jobId: jobId,
    modalId: modalId,
    stage: stage,
    state: state,
    sections: sections,
    pageIndicator: pageIndicator,
    fields: fields,
    buttons: buttonLabels,
  };
}

export async function extractFields(driver) {
  return await driver.executeScript(extractInPage);
}

export { extractInPage };
