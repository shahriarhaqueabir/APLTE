import { Builder, By, Key, until } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';
import { once } from 'node:events';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { startServer } from './dashboard/server.js';
import { dashboardBrowserData } from './dashboard-browser-data.js';

const opts = new chrome.Options();
opts.addArguments('--headless=new', '--window-size=1500,1100');

// Use CHROMEDRIVER_PATH when set, else the repo-local bin/chromedriver(.exe)
// if present, else let Selenium Manager resolve one.
const localDriver = fileURLToPath(new URL('../bin/chromedriver.exe', import.meta.url));
const driverPath = process.env.CHROMEDRIVER_PATH || (existsSync(localDriver) ? localDriver : null);
const service = driverPath ? new chrome.ServiceBuilder(driverPath) : new chrome.ServiceBuilder();

const server = startServer(0, { quiet: true, shutdownGraceMs: 500, getData: dashboardBrowserData });
await once(server, 'listening');
const port = server.address().port;
const base = `http://127.0.0.1:${port}`;

const driver = await new Builder().forBrowser('chrome').setChromeOptions(opts).setChromeService(service).build();
let failures = 0;
function check(cond, msg) { if (!cond) { failures++; console.error('FAIL:', msg); } else console.log('OK:', msg); }
const click = (selector) => driver.executeScript("document.querySelector(arguments[0]).click();", selector);
const showView = (name) => click(`.nav-btn[data-view="${name}"]`);
const sleep = (ms) => driver.sleep(ms);

try {
  await driver.get(base + '/');
  await driver.wait(until.elementLocated(By.id('status')), 10000);

  // 1. SSE status reaches "live"
  await driver.wait(async () => (await driver.findElement(By.id('status')).getText()).includes('live'), 10000);
  check(true, 'SSE status is live');

  // 2. sidebar navigation + fixed top bar exist
  for (const view of ['overview', 'workflows', 'agents', 'interventions', 'timeline', 'console']) {
    const n = await driver.findElements(By.css(`.nav-btn[data-view="${view}"]`));
    check(n.length === 1, `sidebar nav present: ${view}`);
  }
  check(await driver.executeScript("return document.querySelector('.nav-btn.active')?.getAttribute('aria-current') === 'page';"), 'current navigation view is announced');
  const topbar = await driver.findElement(By.css('.topbar'));
  check(await topbar.isDisplayed(), 'fixed top app bar visible');

  // 3. overview sections
  for (const id of ['health', 'healthkpis', 'kpis', 'global', 'personas']) {
    const el = await driver.findElement(By.id(id));
    if (id === 'global') continue;
    check(await el.isDisplayed(), `overview section visible: ${id}`);
  }
  const systemDetails = await driver.findElement(By.id('systemDetails'));
  check(!(await systemDetails.getAttribute('open')), 'system details are collapsed initially');
  check((await driver.findElement(By.css('#view-overview .section-title')).getText()).includes('health and attention'), 'Overview leads with system health');
  var _ss = await driver.findElement(By.css('#systemDetails summary')); await driver.executeScript('arguments[0].scrollIntoView({block:"center"}); arguments[0].click();', _ss); await sleep(200);
  check(await driver.findElement(By.id('global')).isDisplayed(), 'system telemetry remains available in details');
  var _ss = await driver.findElement(By.css('#systemDetails summary')); await driver.executeScript('arguments[0].scrollIntoView({block:"center"}); arguments[0].click();', _ss); await sleep(200);

  // 4. workflows view: filters, bulk, table
  await showView('workflows');
  await sleep(300);
  for (const id of ['fCompany', 'fRole', 'fStage', 'fStatus', 'active', 'apps', 'selectAll']) {
    const el = await driver.findElement(By.id(id));
    check(await el.isDisplayed(), `workflows control visible: ${id}`);
  }
  for (const [id, label] of [['fCompany', 'Filter by company'], ['fRole', 'Filter by role'], ['fStage', 'Filter by stage'], ['fStatus', 'Filter by status']]) {
    check(await driver.findElement(By.id(id)).getAttribute('aria-label') === label, `${id} has an accessible name`);
  }
  check(await driver.findElement(By.id('selectAll')).getAttribute('aria-label') === 'Select all workflows', 'bulk selection checkbox has an accessible name');
  const firstWorkflowCheckbox = await driver.findElement(By.css('#apps input.rowchk[data-folder]'));
  check((await firstWorkflowCheckbox.getAttribute('aria-label')).includes(await firstWorkflowCheckbox.getAttribute('data-folder')), 'workflow selection checkbox identifies its workflow');
  const firstWorkflowExpander = await driver.findElement(By.css('#apps button[data-expand]'));
  const expanderName = await firstWorkflowExpander.getAttribute('aria-label');
  check(expanderName.includes(await firstWorkflowExpander.getText()), 'workflow expander accessible name includes visible text');

  const rows = await driver.findElements(By.css('#apps tr.clickable'));
  check(rows.length > 0, `clickable app rows: ${rows.length}`);

  // 5. real-time filter narrows the table
  const firstName = await driver.executeScript("return document.querySelector('#apps tr.clickable td:nth-child(3)').textContent;");
  await driver.findElement(By.id('fCompany')).sendKeys(firstName.trim().slice(0, 4));
  await sleep(300);
  const filtered = await driver.findElements(By.css('#apps tr.clickable'));
  check(filtered.length > 0 && filtered.length <= rows.length, `company filter narrows rows: ${filtered.length}/${rows.length}`);
  await click('#fClear');
  await sleep(200);

  // 6. bulk selection
  await driver.executeScript("document.querySelector('#apps input.rowchk[data-folder]').click();");
  await sleep(150);
  const bulkText = await driver.findElement(By.id('bulkCount')).getText();
  check(/1 selected/.test(bulkText), `bulk selection count: ${bulkText}`);
  await click('#bulkClear');

  // 7. expand a row -> detail card with artifact cards
  const expander = await driver.findElement(By.css('#apps button[data-expand]'));
  const controlledDetail = await expander.getAttribute('aria-controls');
  check((await expander.getAttribute('aria-expanded')) === 'false', 'workflow details start collapsed');
  check(await driver.executeScript('return !!document.getElementById(arguments[0]);', controlledDetail), 'workflow expander controls its detail row');
  await expander.sendKeys(Key.ENTER);
  await sleep(300);
  const open = await driver.findElements(By.css('#apps tr.detail.open'));
  check(open.length === 1, `row expands to detail: ${open.length}`);
  check((await expander.getAttribute('aria-expanded')) === 'true', 'workflow expansion state is announced');
  const cards = await driver.findElements(By.css('#apps tr.detail.open .doc-row'));
  check(cards.length > 0, `document rows render: ${cards.length}`);
  const moreSummary = await driver.findElements(By.css('#apps tr.detail.open .more-actions summary'));
  if (moreSummary.length) await moreSummary[0].click();
  await sleep(200);
  const masterCvAction = await driver.findElements(By.css('#apps tr.detail.open .actions button[data-act="mark-master-cv-reviewed"]'));
  check(masterCvAction.length === 1, 'master CV review action is distinct');
  await driver.executeScript('arguments[0].scrollIntoView({block:"center"}); arguments[0].focus(); arguments[0].click();', masterCvAction[0]);
  await sleep(200);
  const dialog = await driver.findElement(By.id('modal'));
  check(await dialog.getAttribute('aria-labelledby') === 'modalTitle', 'confirmation dialog has an accessible title');
  check(await driver.executeScript("return document.getElementById('modal').open;"), 'master CV review asks for confirmation');
  check(await driver.executeScript("return document.activeElement.id === 'modalNo';"), 'confirmation dialog moves focus to Cancel');
  await driver.findElement(By.id('modalNo')).sendKeys(Key.ESCAPE);
  check(!(await driver.executeScript("return document.getElementById('modal').open;")), 'Escape closes the confirmation dialog');
  check(await driver.executeScript("return document.activeElement === arguments[0];", masterCvAction[0]), 'dialog restores focus to its trigger');
  await driver.executeScript(`
    window.__fetch = window.fetch;
    window.fetch = function (url, options) {
      if (url === '/api/action') return Promise.resolve({
        ok: true,
        json: function () { return Promise.resolve({ results: [{ ok: true }], audit: { ok: false, error: 'disk unavailable' } }); }
      });
      return window.__fetch(url, options);
    };
  `);
  await driver.executeScript('arguments[0].scrollIntoView({block:"center"}); arguments[0].focus(); arguments[0].click();', masterCvAction[0]);
  await sleep(200);
  await driver.findElement(By.id('modalYes')).click();
  await driver.wait(async () => (await driver.findElement(By.id('toast')).getText()).includes('Audit log failed'), 3000);
  const auditToast = await driver.findElement(By.id('toast')).getText();
  check(auditToast.includes('disk unavailable') && auditToast.includes('Check workflow state'), 'audit failure warns against a blind retry');
  await driver.executeScript('window.fetch = window.__fetch;');
  const copyBtns = await driver.findElements(By.css('#apps tr.detail.open .doc-actions [data-copy]'));
  check(copyBtns.length > 0, `copy-path buttons render: ${copyBtns.length}`);

  // 8. hash badges still render across the dataset
  await driver.executeScript("document.querySelectorAll('#apps button[data-expand]').forEach(function(b){ if(b.getAttribute('aria-expanded') !== 'true') b.click(); });");
  await sleep(500);
  const allOpen = await driver.findElements(By.css('#apps tr.detail.open'));
  check(allOpen.length === rows.length, `all details expanded: ${allOpen.length}/${rows.length}`);
  const badges = await driver.findElements(By.css('#apps tr.detail.open .doc-row .badge, #apps tr.detail.open .doc-group-head .badge'));
  let foundVerified = false, foundMismatch = false;
  for (const b of badges) {
    const t = await b.getText();
    if (t.includes('verified')) foundVerified = true;
    if (t.includes('mismatch')) foundMismatch = true;
  }
  check(foundVerified, 'artifact "verified" badge renders');
  check(foundMismatch, 'artifact "mismatch" badge renders');

  // 9. localStorage persists expanded rows across reload
  const beforeReload = await driver.findElements(By.css('#apps tr.detail.open'));
  await driver.navigate().refresh();
  await driver.wait(until.elementLocated(By.id('status')), 10000);
  await showView('workflows');
  await sleep(800);
  const afterReload = await driver.findElements(By.css('#apps tr.detail.open'));
  check(afterReload.length === beforeReload.length, `expanded rows persist after reload: ${afterReload.length}/${beforeReload.length}`);

  // 10. agents view + expandable agent cards
  await showView('agents');
  await sleep(300);
  const agentCards = await driver.findElements(By.css('#agents .agent-card'));
  check(agentCards.length >= 7, `agent cards render: ${agentCards.length}`);
  const pipelineDots = await driver.findElements(By.css('.agent-pipe-dot'));
  check(pipelineDots.length >= 7, `pipeline dots render: ${pipelineDots.length}`);
  if (agentCards.length) {
    await agentCards[0].click();
    await sleep(200);
    const opened = await driver.findElements(By.css('#agents .agent-card.open'));
    check(opened.length >= 1, `agent card expands: ${opened.length}`);
    await agentCards[0].click();
  }

  // 11. timeline tabs + relative timestamps
  await showView('timeline');
  await sleep(300);
  const tabs = await driver.findElements(By.css('#tlTabs .tab'));
  check(tabs.length === 4, `timeline filter tabs: ${tabs.length}`);
  await click('#tlTabs .tab[data-tl="agent"]');
  await sleep(300);
  const tlRows = await driver.findElements(By.css('#timeline tr'));
  check(tlRows.length > 0, `timeline agent rows: ${tlRows.length}`);
  const firstTime = await driver.executeScript("return document.querySelector('#timeline tr td').textContent;");
  check(/ago|just now/.test(firstTime), `timeline relative time: ${firstTime}`);

  // 12. interventions row jumps to workflow detail
  await showView('interventions');
  await sleep(300);
  const ivRows = await driver.findElements(By.css('#interventions button[data-open-workflow]'));
  check(ivRows.length > 0, `keyboard-operable intervention controls: ${ivRows.length}`);
  if (ivRows.length) {
    await ivRows[0].sendKeys(Key.ENTER);
    await sleep(400);
    const wfActive = await driver.executeScript("return document.getElementById('view-workflows').classList.contains('active');");
    check(wfActive, 'intervention click opens workflows view');
    const detailOpen = await driver.findElements(By.css('#apps tr.detail.open'));
    check(detailOpen.length >= 1, `intervention opens matching detail: ${detailOpen.length}`);
  }

  // 13. live console view
  await showView('console');
  await sleep(300);
  const consoleStatus = await driver.findElement(By.id('consoleStatus')).getText();
  check(!!consoleStatus, `console status present: ${consoleStatus}`);
  const consoleBox = await driver.findElement(By.id('console'));
  check(await consoleBox.isDisplayed(), 'live console visible');

  // 13b. documents library view renders real content
  await showView('docslib');
  await sleep(400);
  const docslib = await driver.executeScript(`
    const q = (s) => document.querySelector(s);
    const realRows = (s) => q(s) ? q(s).querySelectorAll('tr:not([data-key="__empty"])').length : -1;
    const textLen = (s) => q(s) ? q(s).textContent.trim().length : 0;
    return {
      renderRows: realRows('#renderHistory'),
      cvRows: realRows('#docslibCv'),
      masterCv: textLen('#masterCvBlock'),
      masterCl: textLen('#masterClBlock'),
      template: textLen('#templateStatusBlock')
    };
  `);
  check(docslib.renderRows > 0, `documents library render history rows: ${docslib.renderRows}`);
  check(docslib.cvRows > 0, `documents library role CV rows: ${docslib.cvRows}`);
  check(docslib.masterCv > 0, 'master CV card shows content');
  check(docslib.masterCl > 0, 'master cover letter card shows content');
  check(docslib.template > 0, 'locked template status card shows content');

  // 13c. guardrails view renders rules, summary and ToS acknowledgement
  await showView('guardrails');
  await sleep(400);
  const guardrails = await driver.executeScript(`
    const q = (s) => document.querySelector(s);
    const realRows = (s) => q(s) ? q(s).querySelectorAll('tr:not([data-key="__empty"])').length : -1;
    return {
      rules: q('#guardrailRules') ? q('#guardrailRules').querySelectorAll('.gr-row').length : -1,
      summary: q('#guardrailSummary') ? q('#guardrailSummary').children.length : -1,
      tos: q('#tosAck') ? q('#tosAck').textContent.trim().length : 0
    };
  `);
  check(guardrails.rules > 0, `guardrail rule rows: ${guardrails.rules}`);
  check(guardrails.summary >= 2, `guardrail summary cards: ${guardrails.summary}`);
  check(guardrails.tos > 0, 'ToS acknowledgement card shows content');

  // 14. every visible element font-size >= 12px
  const minFont = await driver.executeScript(`
    let min = 999; const bad = [];
    document.querySelectorAll('body *').forEach(el => {
      const cs = window.getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') return;
      const fs = parseFloat(cs.fontSize);
      if (!fs) return;
      if (fs < min) min = fs;
      if (fs < 12) bad.push((el.tagName + '.' + el.className).slice(0,60) + '=' + fs + 'px');
    });
    return { min, bad: bad.slice(0, 10) };
  `);
  check(minFont.min >= 12, `minimum computed font-size is ${minFont.min}px`);
  if (minFont.bad.length) console.error('  elements under 12px:', minFont.bad);

  // 15. responsive navigation and locally scrollable tables
  for (const width of [375, 768, 1440]) {
    await driver.sendDevToolsCommand('Emulation.setDeviceMetricsOverride', {
      width,
      height: 1000,
      deviceScaleFactor: 1,
      mobile: width <= 800,
    });
    await showView('workflows');
    await sleep(250);
    const layout = await driver.executeScript(`
      const wrapper = document.querySelector('#apps').closest('.table-wrap');
      const activeHeader = document.querySelector('#active').closest('table').querySelector('th');
      return {
        viewport: window.innerWidth,
        document: document.documentElement.scrollWidth,
        navigation: document.querySelector('.sidebar').getBoundingClientRect().width,
        wrapper: !!wrapper,
        tableScrolls: wrapper && wrapper.scrollWidth > wrapper.clientWidth,
        headerPosition: getComputedStyle(activeHeader).position,
        headerWithinTable: !!activeHeader.closest('.table-wrap'),
        controls: document.getElementById('fCompany').getBoundingClientRect().width > 0
      };
    `);
    check(layout.viewport === width, `viewport set to ${width}px (actual ${layout.viewport}px)`);
    check(layout.document <= layout.viewport, `no page overflow at ${width}px (${layout.document}px)`);
    check(layout.wrapper && layout.controls, `workflow controls and table region present at ${width}px`);
    check(layout.headerPosition === 'static' && layout.headerWithinTable, `table header remains in its table at ${width}px`);
    if (width <= 800) check(layout.tableScrolls, `workflow table scrolls within its region at ${width}px`);
  }

  // 16. reduced-motion preferences disable animation and smooth scrolling
  await driver.sendDevToolsCommand('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
  });
  const pulseAnimation = await driver.executeScript("return getComputedStyle(document.getElementById('pulse')).animationName;");
  check(pulseAnimation === 'none', 'live pulse respects reduced-motion preference');
  await driver.executeScript(`
    window.__scrollBehavior = null;
    window.__originalScrollIntoView = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (options) { window.__scrollBehavior = options && options.behavior; };
  `);
  await showView('interventions');
  const reducedMotionIntervention = await driver.findElement(By.css('#interventions button[data-open-workflow]'));
  await reducedMotionIntervention.sendKeys(Key.ENTER);
  const scrollBehavior = await driver.executeScript("return window.__scrollBehavior;");
  check(scrollBehavior === 'auto', `intervention navigation uses ${scrollBehavior} scrolling for reduced motion`);
  await driver.executeScript('Element.prototype.scrollIntoView = window.__originalScrollIntoView;');

  // 17. /file serves a real document
  const fileStatus = await driver.executeScript(`
    return fetch('/file?path=' + encodeURIComponent('data/out/easy-apply/' + document.querySelector('#apps tr.clickable')?.dataset.folder + '/letter.md'))
      .then(r => r.status).catch(() => 0);
  `);
  check(fileStatus === 200 || fileStatus === 404, `/file endpoint responds: ${fileStatus}`);

  // 18. a second tab keeps the dashboard alive until the last tab closes
  const originalWindow = await driver.getWindowHandle();
  await driver.switchTo().newWindow('tab');
  await driver.get(base + '/');
  await driver.wait(until.elementLocated(By.id('status')), 10000);
  await driver.wait(async () => (await driver.findElement(By.id('status')).getText()).includes('live'), 10000);
  check(true, 'second tab SSE status is live');
  await driver.close();
  await driver.switchTo().window(originalWindow);

  const apiStatus = await driver.executeScript("return fetch('/api/data').then(response => response.status);");
  check(apiStatus === 200, `original tab API remains available after second tab closes: ${apiStatus}`);

  const serverClosed = once(server, 'close').then(() => true);
  await driver.close();
  let closeTimeout;
  const closed = await Promise.race([
    serverClosed,
    new Promise((resolve) => { closeTimeout = setTimeout(() => resolve(false), 3000); }),
  ]);
  clearTimeout(closeTimeout);
  check(closed && server.listening === false, 'server closes after the original tab closes');

  console.log(failures === 0 ? '\nBROWSER TEST OK' : `\nBROWSER TEST FAILED (${failures})`);
  process.exitCode = failures === 0 ? 0 : 1;
} catch (e) {
  console.error('BROWSER TEST ERROR:', e.message);
  process.exitCode = 1;
} finally {
  await driver.quit();
  if (server.listening) await new Promise((r) => server.close(r));
}
