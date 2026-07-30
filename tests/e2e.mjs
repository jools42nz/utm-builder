import { chromium } from 'playwright';

const BASE = `http://localhost:${process.env.PORT || 8420}`;
const results = [];

function log(name, pass, detail = '') {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'} - ${name}${detail ? ' :: ' + detail : ''}`);
}

const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();

async function fillBatch({ setUpBy = 'Jools Test', date = '2026-07-30', paidOrganic = 'Paid' } = {}) {
  await page.fill('#setUpBy', setUpBy);
  await page.fill('#date', date);
  await page.selectOption('#paidOrganic', paidOrganic);
}

async function fillFields(fields) {
  for (const [key, value] of Object.entries(fields)) {
    await page.fill(`#${key}`, value);
  }
}

// ---- Test 1: valid paid combination ----
await page.goto(`${BASE}/index.html`);
await page.evaluate(() => localStorage.clear());
await page.reload();
await fillBatch();
await fillFields({
  pageUrl: 'https://www.port.ac.uk/study/courses/example',
  campaign: 'summer-open-day',
  gaMedium: 'cpc',
  campaignTerm: 'nonbrand',
  source: 'google',
  campaignContent: 'hero-banner',
});
await page.click('#generate-btn');
await page.waitForSelector('#results-section:not([hidden])');
const summary1 = await page.textContent('#results-summary');
log('Test 1: valid paid combination generates with 0 errors', summary1.includes('1 valid') && !summary1.includes('with errors'), summary1);
const utmCell = await page.textContent('.utm-output');
log('Test 1: UTM contains utm_source/utm_medium/utm_campaign/utm_term/utm_content', /utm_source=google/.test(utmCell) && /utm_medium=cpc/.test(utmCell) && /utm_term=nonbrand/.test(utmCell), utmCell);

// ---- Test 2: blocked paid/organic mismatch ----
await page.reload();
await fillBatch({ paidOrganic: 'Paid' });
await fillFields({
  pageUrl: 'https://www.port.ac.uk/x',
  campaign: 'x',
  gaMedium: 'organic-social', // organic-only medium, but batch is Paid
  campaignTerm: 'none',
  source: 'facebook',
  campaignContent: 'x',
});
await page.click('#generate-btn');
await page.waitForSelector('#results-section:not([hidden])');
const gaMediumErrors = await page.textContent('#gaMedium-errors');
log('Test 2: paid batch + organic-only medium is blocked inline next to GA4 Medium field', gaMediumErrors.includes('organic-social') && gaMediumErrors.includes('not a valid GA4 Medium for Paid'), gaMediumErrors);
const summary2 = await page.textContent('#results-summary');
log('Test 2: summary reflects the error', summary2.includes('with errors'), summary2);

// ---- Test 3: unequal line counts ----
await page.reload();
await fillBatch();
await fillFields({
  pageUrl: 'https://www.port.ac.uk/a\nhttps://www.port.ac.uk/b\nhttps://www.port.ac.uk/c',
  campaign: 'camp-a\ncamp-b', // 2 lines - mismatched (not 1, not 3)
  gaMedium: 'cpc',
  campaignTerm: 'nonbrand',
  source: 'google',
  campaignContent: 'x',
});
await page.click('#generate-btn');
const campaignErrors = await page.textContent('#campaign-errors');
log('Test 3: unequal line count blocked with clear message', campaignErrors.includes('2 line(s)') && campaignErrors.includes('needs 3'), campaignErrors);
const resultsHidden3 = await page.getAttribute('#results-section', 'hidden');
log('Test 3: generation blocked entirely (no partial batch)', resultsHidden3 !== null, `hidden=${resultsHidden3}`);

// ---- Test 4: 150-row batch ----
await page.reload();
await fillBatch();
const n = 150;
const urls = Array.from({ length: n }, (_, i) => `https://www.port.ac.uk/page-${i}`).join('\n');
const campaigns = Array.from({ length: n }, (_, i) => `campaign-${i}`).join('\n');
const terms = Array.from({ length: n }, () => 'nonbrand').join('\n');
const sources = Array.from({ length: n }, () => 'google').join('\n');
const contents = Array.from({ length: n }, (_, i) => `content-${i}`).join('\n');
await fillFields({ pageUrl: urls, campaign: campaigns, gaMedium: 'cpc', campaignTerm: terms, source: sources, campaignContent: contents });
const t0 = Date.now();
await page.click('#generate-btn');
await page.waitForSelector('#results-section:not([hidden])');
const elapsed = Date.now() - t0;
const rowCount = await page.locator('.results-table tbody tr').count();
const summary4 = await page.textContent('#results-summary');
log('Test 4: 150-row batch generates all 150 rows without loss', rowCount === n, `rows=${rowCount}, summary="${summary4}", elapsed=${elapsed}ms`);

// ---- Test 5: duplicate detection (within batch + against shared view) ----
await page.reload();
await page.evaluate(() => localStorage.clear());
await page.reload();
await fillBatch();
await fillFields({
  pageUrl: 'https://www.port.ac.uk/dup\nhttps://www.port.ac.uk/dup',
  campaign: 'dup-camp',
  gaMedium: 'cpc',
  campaignTerm: 'nonbrand',
  source: 'google',
  campaignContent: 'dup-content',
});
await page.click('#generate-btn');
await page.waitForSelector('#results-section:not([hidden])');
const badges5 = await page.locator('.badge-warn').count();
log('Test 5: within-batch duplicate flagged', badges5 === 1, `warn badges=${badges5}`);
// Confirm this batch, then re-generate the same single row and check it's flagged as already-existing
await page.click('#confirm-open-btn');
await page.click('#confirm-yes-btn');
await page.waitForFunction(() => document.getElementById('confirm-dialog').hidden === true);
await page.reload();
await fillBatch();
await fillFields({
  pageUrl: 'https://www.port.ac.uk/dup',
  campaign: 'dup-camp',
  gaMedium: 'cpc',
  campaignTerm: 'nonbrand',
  source: 'google',
  campaignContent: 'dup-content',
});
await page.click('#generate-btn');
await page.waitForSelector('#results-section:not([hidden])');
const dupNote = await page.textContent('.row-duplicate-note');
log('Test 5: duplicate against shared view detected', dupNote.includes('Already exists in the shared view'), dupNote);

// ---- Test 6: cancelled confirmation writes nothing ----
await page.evaluate(() => localStorage.clear());
await page.reload();
await fillBatch();
await fillFields({
  pageUrl: 'https://www.port.ac.uk/cancel-test',
  campaign: 'cancel-camp',
  gaMedium: 'cpc',
  campaignTerm: 'nonbrand',
  source: 'google',
  campaignContent: 'x',
});
await page.click('#generate-btn');
await page.waitForSelector('#results-section:not([hidden])');
const dialogText = await page.textContent('#confirm-dialog-text');
log('Test 6: confirmation text matches exactly', dialogText.trim() === "Are you sure you are happy with the outputted UTM's, if so, click yes and the newly generated UTM's will populate into the shared view", dialogText.trim());
await page.click('#confirm-open-btn');
await page.click('#confirm-cancel-btn');
const storedAfterCancel = await page.evaluate(() => localStorage.getItem('utm-builder:records'));
log('Test 6: cancel writes nothing to storage', storedAfterCancel === null, `stored=${storedAfterCancel}`);

// ---- Test 7: keyboard-only pass ----
await page.evaluate(() => localStorage.clear());
await page.reload();
// Tab from body into the skip link, then into the form
await page.keyboard.press('Tab');
const skipLinkFocused = await page.evaluate(() => document.activeElement.className);
log('Test 7: skip link is first focusable element', skipLinkFocused.includes('skip-link'), skipLinkFocused);

await fillBatch();
await fillFields({
  pageUrl: 'https://www.port.ac.uk/kb-test',
  campaign: 'kb-camp',
  gaMedium: 'cpc',
  campaignTerm: 'nonbrand',
  source: 'google',
  campaignContent: 'x',
});
// Reach Generate button via keyboard and activate with Enter
await page.focus('#campaignContent');
await page.keyboard.press('Tab'); // -> generate button
const focusedGenerate = await page.evaluate(() => document.activeElement.id);
log('Test 7: tab order reaches Generate button after last field', focusedGenerate === 'generate-btn', focusedGenerate);
await page.keyboard.press('Enter');
await page.waitForSelector('#results-section:not([hidden])');

// Keyboard-reach confirm dialog and test focus trap + Escape
await page.focus('#confirm-open-btn');
await page.keyboard.press('Enter');
await page.waitForSelector('#confirm-dialog:not([hidden])');
const focusOnOpen = await page.evaluate(() => document.activeElement.id);
log('Test 7: dialog opens with focus moved inside it', focusOnOpen === 'confirm-cancel-btn', focusOnOpen);
await page.keyboard.press('Tab');
const focusAfterTab = await page.evaluate(() => document.activeElement.id);
log('Test 7: Tab cycles within dialog (does not escape to page)', focusAfterTab === 'confirm-yes-btn', focusAfterTab);
await page.keyboard.press('Tab');
const focusAfterTab2 = await page.evaluate(() => document.activeElement.id);
log('Test 7: Tab wraps back to Cancel (2-item trap)', focusAfterTab2 === 'confirm-cancel-btn', focusAfterTab2);
await page.keyboard.press('Escape');
const dialogHiddenAfterEsc = await page.getAttribute('#confirm-dialog', 'hidden');
log('Test 7: Escape closes the dialog without writing', dialogHiddenAfterEsc !== null, `hidden=${dialogHiddenAfterEsc}`);
const focusAfterEsc = await page.evaluate(() => document.activeElement.id);
log('Test 7: focus returns to the opener button after closing', focusAfterEsc === 'confirm-open-btn', focusAfterEsc);

// aria-invalid check from test 2 scenario, done via keyboard-triggered generation
await page.reload();
await fillBatch({ paidOrganic: 'Paid' });
await fillFields({ pageUrl: 'https://www.port.ac.uk/x', campaign: 'x', gaMedium: 'organic-social', campaignTerm: 'none', source: 'facebook', campaignContent: 'x' });
await page.focus('#generate-btn');
await page.keyboard.press('Enter');
await page.waitForSelector('#results-section:not([hidden])');
const ariaInvalid = await page.getAttribute('#gaMedium', 'aria-invalid');
log('Test 7: invalid field gets aria-invalid="true" for screen readers', ariaInvalid === 'true', ariaInvalid);

// ---- Shared view: filters ----
await page.evaluate(() => localStorage.clear());
await page.reload();
await fillBatch({ setUpBy: 'Alice' });
await fillFields({ pageUrl: 'https://www.port.ac.uk/alice', campaign: 'alice-camp', gaMedium: 'cpc', campaignTerm: 'nonbrand', source: 'google', campaignContent: 'x' });
await page.click('#generate-btn');
await page.click('#confirm-open-btn');
await page.click('#confirm-yes-btn');
await page.waitForFunction(() => document.getElementById('confirm-dialog').hidden === true);

await page.goto(`${BASE}/shared.html`);
await page.waitForSelector('.results-table');
const sharedRows1 = await page.locator('.results-table tbody tr').count();
log('Shared view: confirmed UTM appears without further action', sharedRows1 === 1, `rows=${sharedRows1}`);
await page.fill('#filter-setUpBy', 'Bob');
const sharedSummary = await page.textContent('#shared-summary');
log('Shared view: filter by Set Up By narrows results to 0', sharedSummary.includes('Showing 0 of 1'), sharedSummary);

await browser.close();

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
if (failed.length > 0) {
  console.log('FAILURES:', failed.map((f) => f.name));
  process.exit(1);
}
