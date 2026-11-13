// src/browser/open.js
// Opens an Easy Apply modal: finds and clicks the Easy Apply button,
// waits for the modal dialog, and checks for challenge/CAPTCHA.

import { By, until } from 'selenium-webdriver';
import { assertNoChallenge } from '../scan/challenge.js';
import { appendLiveLog } from '../util/live-log.js';

const EASY_APPLY_SELECTORS = [
  'button[aria-label*="Easy Apply"]',
  'button.jobs-apply-button',
  'button[data-control-name="jobdetails_topcard_inapply"]',
];

const MODAL_SELECTORS = 'dialog, [role="dialog"], .artdeco-modal, .jobs-easy-apply-content';

const CHALLENGE_SELECTORS = [
  'iframe[src*="captcha"]',
  'iframe[src*="recaptcha"]',
  '[class*="challenge"]',
  '[id*="captcha"]',
];

/**
 * Open the Easy Apply modal on the current page.
 *
 * @param {import('selenium-webdriver').WebDriver} driver
 * @param {object} [options]
 * @param {number} [options.timeoutMs=15000]
 * @returns {Promise<{ opened: boolean, challenge: object }>}
 */
export async function openEasyApply(driver, options = {}) {
  const timeoutMs = options.timeoutMs || 15000;

  // Check for challenge before acting
  const preText = await driver.executeScript('return document.body.innerText || "";');
  const preFound = await findChallengeSelectors(driver);
  try { assertNoChallenge({ text: preText, foundSelectors: preFound }); }
  catch (e) { appendLiveLog('[OPEN] ERROR challenge detected before click: ' + (e && e.message)); throw e; }

  // Find Easy Apply button
  let btn = null;
  for (const sel of EASY_APPLY_SELECTORS) {
    const els = await driver.findElements(By.css(sel));
    if (els.length > 0) { btn = els[0]; break; }
  }
  // Fallback: find by text
  if (!btn) {
    const buttons = await driver.findElements(By.css('button'));
    for (const b of buttons) {
      const t = (await b.getText()).trim();
      if (/easy apply/i.test(t)) { btn = b; break; }
    }
  }
  if (!btn) { appendLiveLog('[OPEN] ERROR no Easy Apply button found'); throw new Error('No Easy Apply button found on this page.'); }
  appendLiveLog('[OPEN] clicking Easy Apply button');
  // Click via JS (avoids overlay interception)
  await driver.executeScript('arguments[0].click();', btn);

  // Wait for modal
  await driver.wait(until.elementLocated(By.css(MODAL_SELECTORS)), timeoutMs);
  await new Promise((r) => setTimeout(r, 1000));

  // Check for challenge after modal opens
  const postText = await driver.executeScript('return document.body.innerText || "";');
  const foundSelectors = await findChallengeSelectors(driver);
  const challenge = assertNoChallenge({ text: postText, foundSelectors });

  appendLiveLog('[OPEN] modal opened; challenge=' + (challenge && challenge.detected ? 'DETECTED' : 'none'));
  return { opened: true, challenge: challenge };
}

async function findChallengeSelectors(driver) {
  const found = [];
  for (const sel of CHALLENGE_SELECTORS) {
    try {
      const els = await driver.findElements(By.css(sel));
      if (els.length > 0) found.push(sel);
    } catch (e) { /* ignore */ }
  }
  return found;
}
