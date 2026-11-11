// src/fill/execute.js
// Fills one Easy Apply page from a plan, verifies readback, clicks Next only.
// Safety: refuses file inputs and submit buttons; honours page-hash and TTL gates.

import { assertFillable, assertAdvanceAllowed, assertPlanFresh, assertPageUnchanged } from './guard.js';

const FILL_IN_PAGE = function (label, value) {
  const dialog = document.querySelector('dialog, [role="dialog"], .artdeco-modal, .jobs-easy-apply-content');
  if (!dialog) return { ok: false, error: 'no-modal' };

  function toText(v) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim(); }

  function findLabelEl(text) {
    // 1. Standard label[for]
    const candidates = Array.from(dialog.querySelectorAll('label, [aria-labelledby]'));
    for (const el of candidates) {
      const t = toText(el.innerText);
      if (t === text) return el;
    }
    for (const el of candidates) {
      const t = toText(el.innerText);
      if (t && (t.startsWith(text) || text.startsWith(t))) return el;
    }
    // 2. Find by text content in any element (for typeahead/custom fields)
    const allEls = Array.from(dialog.querySelectorAll('*'));
    for (const el of allEls) {
      const t = toText(el.innerText);
      if (t === text && el.children.length === 0) return el;
    }
    // 3. Match by placeholder text (e.g. "Enter city or location")
    const lowerText = text.toLowerCase();
    const isCityField = /city|location|stadt|ort/i.test(lowerText);
    for (const el of allEls) {
      const ph = (el.getAttribute && el.getAttribute('placeholder')) || '';
      const phLower = ph.toLowerCase();
      if (ph && (phLower.includes('city') || phLower.includes('location') || phLower.includes('stadt') || phLower.includes('ort'))) {
        if (isCityField) {
          // Return the input itself so findControl can use it directly
          return el;
        }
      }
    }
    return null;
  }

  function findControl(labelEl) {
    if (!labelEl) return null;
    // 1. Standard label[for]
    const forId = labelEl.getAttribute('for');
    if (forId) {
      const el = document.getElementById(forId);
      if (el) return el;
    }
    // 2. If labelEl is an input itself (synthetic match)
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(labelEl.tagName)) return labelEl;
    // 3. Inner input
    const inner = labelEl.querySelector('input, select, textarea');
    if (inner) return inner;
    // 4. Next sibling
    let sib = labelEl.nextElementSibling;
    while (sib && !/^(INPUT|SELECT|TEXTAREA)$/.test(sib.tagName)) sib = sib.nextElementSibling;
    if (sib) return sib;
    // 5. Previous sibling
    let prev = labelEl.previousElementSibling;
    while (prev && !/^(INPUT|SELECT|TEXTAREA)$/.test(prev.tagName)) prev = prev.previousElementSibling;
    if (prev) return prev;
    // 6. Search within parent
    const parent = labelEl.parentElement;
    if (parent) {
      const inp = parent.querySelector('input, select, textarea');
      if (inp) return inp;
    }
    // 7. If labelEl is a parent that contains the input (from placeholder match)
    const closest = labelEl.closest('div, fieldset, section');
    if (closest) {
      const inp = closest.querySelector('input, select, textarea');
      if (inp) return inp;
    }
    return null;
  }

  const labelEl = findLabelEl(label);
  if (!labelEl) return { ok: false, error: 'label-not-found', label: label };

  const control = findControl(labelEl);
  if (!control) return { ok: false, error: 'control-not-found', label: label };

  const tag = control.tagName.toLowerCase();
  const type = control.type || '';

  // Select
  if (tag === 'select') {
    const opts = Array.from(control.options);
    let target = opts.find((o) => toText(o.text) === toText(value) || o.value === value);
    if (!target) {
      const norm = (s) => toText(s).toLowerCase();
      target = opts.find((o) => norm(o.text) === norm(value));
    }
    if (!target) return { ok: false, error: 'option-not-found', label: label, available: opts.map((o) => toText(o.text)) };
    const ns = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
    ns.call(control, target.value);
    control.dispatchEvent(new Event('change', { bubbles: true }));
    control.dispatchEvent(new Event('blur', { bubbles: true }));
    return { ok: true, readback: control.value, how: 'select' };
  }

  // Radio group
  if (type === 'radio') {
    const name = control.getAttribute('name');
    const fieldset = control.closest('fieldset') || control.closest('[role="radiogroup"]');
    let group;
    if (fieldset) {
      group = Array.from(fieldset.querySelectorAll('input[type="radio"]'));
    } else if (name) {
      group = Array.from(dialog.querySelectorAll('input[type="radio"][name="' + CSS.escape(name) + '"]'));
    } else {
      group = [control];
    }
    let target = null;
    for (const r of group) {
      let rLabel = '';
      const rId = r.getAttribute('id');
      const rLb = r.getAttribute('aria-labelledby');
      if (rLb) {
        const ref = document.getElementById(rLb);
        if (ref) rLabel = toText(ref.innerText);
      }
      if (!rLabel && rId) {
        const lbl = document.querySelector('label[for="' + CSS.escape(rId) + '"]');
        if (lbl) rLabel = toText(lbl.innerText);
      }
      if (!rLabel) {
        let node = r.parentElement;
        for (let i = 0; i < 5 && node; i++) {
          const t = toText(node.innerText);
          if (t && t.length > 1 && t.length < 120) { rLabel = t; break; }
          node = node.parentElement;
        }
      }
      if (rLabel === toText(value) || rLabel.includes(value) || toText(value).includes(rLabel)) {
        target = r; break;
      }
    }
    if (!target) return { ok: false, error: 'radio-option-not-found', label: label, available: group.map((r) => r.getAttribute('aria-label') || r.getAttribute('id')) };
    // JS click + change event
    target.click();
    target.dispatchEvent(new Event('change', { bubbles: true }));
    target.dispatchEvent(new Event('input', { bubbles: true }));
    return { ok: true, readback: 'clicked', how: 'radio' };
  }

  // Checkbox
  if (type === 'checkbox') {
    const shouldCheck = /^(true|yes|ja|1)$/i.test(String(value).trim());
    if (shouldCheck !== control.checked) {
      control.click();
      control.dispatchEvent(new Event('change', { bubbles: true }));
    }
    return { ok: true, readback: control.checked ? 'true' : 'false', how: 'checkbox' };
  }

  // Text-like inputs and textareas (native value setter for React controlled inputs)
  const proto = tag === 'textarea' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  const ns = Object.getOwnPropertyDescriptor(proto, 'value').set;
  ns.call(control, value);
  control.dispatchEvent(new Event('input', { bubbles: true }));
  control.dispatchEvent(new Event('change', { bubbles: true }));
  control.dispatchEvent(new Event('blur', { bubbles: true }));
  return { ok: true, readback: control.value, how: 'text' };
};

/**
 * Fill one page from a plan object.
 *
 * Plan shape:
 *   { pageHash, createdAt, fills: [{ field: descriptor, value: string }, ...] }
 *
 * @param {import('selenium-webdriver').WebDriver} driver
 * @param {object} plan
 * @param {Array<object>} currentFields  - live field descriptors from extractFields
 * @param {number} [now]
 * @returns {Promise<{ filled: Array<{field, value, readback, how}>, nextClicked: boolean }>}
 */
export async function fillPage(driver, plan, currentSnapshot, now = Date.now()) {
  assertPlanFresh(plan, now);
  // Normalise: accept either a full scan snapshot or a bare fields array
  const snapshot = Array.isArray(currentSnapshot)
    ? { fields: currentSnapshot }
    : (currentSnapshot || {});
  assertPageUnchanged(plan, snapshot);

  const filled = [];
  for (const action of (plan.fills || [])) {
    const field = action.field;
    assertFillable(field);
    const result = await driver.executeScript(FILL_IN_PAGE, field.label, action.value);
    if (!result || !result.ok) {
      throw new Error(`Fill failed for "${field.label}": ${result && result.error ? result.error : 'unknown'}${result && result.available ? ' (available: ' + result.available.join(', ') + ')' : ''}`);
    }
    // Verify readback for text/select
    if (result.how === 'text' || result.how === 'select') {
      if (result.how === 'text' && result.readback !== action.value) {
        // Soft check: some fields normalize (e.g. date picker). Log but don't throw.
        // eslint-disable-next-line no-console
        console.warn(`[execute] readback mismatch for "${field.label}": expected "${action.value}", got "${result.readback}"`);
      }
    }
    filled.push({ field: field, value: action.value, readback: result.readback, how: result.how });
  }

  // Click the advance button (Next/Continue/Review) — never Submit.
  // The caller provides the button label via plan.advanceButton (default 'Next').
  const advanceLabel = (plan.advanceButton || 'Next').trim();
  const clicked = await clickAdvance(driver, advanceLabel);
  return { filled: filled, nextClicked: clicked };
}

async function clickAdvance(driver, label) {
  const result = await driver.executeScript(function (btnLabel) {
    const dialog = document.querySelector('dialog, [role="dialog"], .artdeco-modal, .jobs-easy-apply-content');
    if (!dialog) return { ok: false, error: 'no-modal' };
    const buttons = Array.from(dialog.querySelectorAll('button'));
    const target = buttons.find((b) => (b.innerText || '').trim().toLowerCase() === btnLabel.toLowerCase());
    if (!target) return { ok: false, error: 'button-not-found', available: buttons.map((b) => (b.innerText || '').trim()) };
    // Guard: refuse terminal buttons
    const t = (target.innerText || '').trim();
    const terminal = /\bsubmit\b/i.test(t) || /\bsend application\b/i.test(t) || /^send$/i.test(t) || /application sent/i.test(t) || /bewerbung absenden/i.test(t) || /^absenden$/i.test(t) || /bewerbung einreichen/i.test(t) || /jetzt bewerben/i.test(t) || /abschicken/i.test(t);
    if (terminal) return { ok: false, error: 'terminal-button', label: t };
    target.click();
    return { ok: true, label: t };
  }, label);

  if (!result || !result.ok) {
    throw new Error(`Advance click failed: ${result && result.error ? result.error : 'unknown'}${result && result.available ? ' (available: ' + result.available.join(', ') + ')' : ''}`);
  }
  // Also run the Node-side guard for belt-and-braces
  assertAdvanceAllowed(result.label);
  return true;
}

export { clickAdvance };
