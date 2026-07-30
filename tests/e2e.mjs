import { chromium } from 'playwright';

const BASE = `http://localhost:${process.env.PORT || 8420}`;
const results = [];
function log(name, pass, detail = '') {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'} - ${name}${detail ? ' :: ' + detail : ''}`);
}

const browser = await chromium.launch();
const page = await browser.newPage();

async function fillBatch({ setUpBy = 'E2E Tester', date = '2026-07-30', paidOrganic = 'Paid' } = {}) {
  await page.fill('#setUpBy', setUpBy);
  await page.fill('#date', date);
  if (paidOrganic) await page.selectOption('#paidOrganic', paidOrganic);
}

async function fillRow(rowLocator, { pageUrl, campaign, gaMedium, campaignTerm, source, campaignContent, otherSource }) {
  if (pageUrl !== undefined) await rowLocator.locator('.row-pageUrl').fill(pageUrl);
  if (campaign !== undefined) await rowLocator.locator('.row-campaign').fill(campaign);
  if (gaMedium !== undefined) await rowLocator.locator('.row-gaMedium').selectOption(gaMedium);
  if (campaignTerm !== undefined) await rowLocator.locator('.row-campaignTerm').selectOption(campaignTerm);
  if (source !== undefined) await rowLocator.locator('.row-source').selectOption(source);
  if (otherSource !== undefined) await rowLocator.locator('.row-source-other').fill(otherSource);
  if (campaignContent !== undefined) await rowLocator.locator('.row-campaignContent').fill(campaignContent);
}

function row(n = 0) {
  return page.locator('#rows-tbody tr').nth(n);
}

async function resetPage() {
  await page.goto(`${BASE}/index.html`);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
}

async function reloadKeepingStorage() {
  await page.goto(`${BASE}/index.html`);
}

// ---- Test 1: cascading dropdowns respect Paid/Organic ----
await resetPage();
await page.selectOption('#paidOrganic', 'Organic');
const organicMediums = await row().locator('.row-gaMedium option').allTextContents();
log(
  'Organic hides Paid-only mediums (ppc, affiliate, audio)',
  !organicMediums.includes('ppc') && !organicMediums.includes('affiliate') && !organicMediums.includes('audio') && organicMediums.includes('email'),
  organicMediums.join(',')
);

await page.selectOption('#paidOrganic', 'Paid');
const paidMediums = await row().locator('.row-gaMedium option').allTextContents();
log(
  'Paid hides Organic-only mediums (social, video, referral)',
  !paidMediums.includes('social') && !paidMediums.includes('video') && !paidMediums.includes('referral') && paidMediums.includes('ppc'),
  paidMediums.join(',')
);

await row().locator('.row-gaMedium').selectOption('email');
const paidEmailTerms = await row().locator('.row-campaignTerm option').allTextContents();
log('email medium under Paid only offers paid-email', paidEmailTerms.includes('paid-email') && !paidEmailTerms.includes('organic-email'), paidEmailTerms.join(','));

await row().locator('.row-campaignTerm').selectOption('paid-email');
const paidEmailSources = await row().locator('.row-source option').allTextContents();
log('paid-email term offers its real historical sources', paidEmailSources.includes('reed') && paidEmailSources.includes('Other (new source)…'), paidEmailSources.join(','));

// ---- Test 2: valid generation produces the correct real-world UTM shape ----
await resetPage();
await fillBatch({ paidOrganic: 'Organic' });
await fillRow(row(), {
  pageUrl: 'https://www.port.ac.uk/study/courses/example',
  campaign: 'ug2026-uop',
  gaMedium: 'email',
  campaignTerm: 'organic-email',
  source: 'alumni-email',
  campaignContent: 'newsletter',
});
await page.click('#generate-btn');
await page.waitForSelector('#results-section:not([hidden])');
const summary1 = await page.textContent('#results-summary');
log('Valid row generates with 0 errors', summary1.includes('1 valid') && !summary1.includes('with errors'), summary1);
const utm1 = await row().locator('.utm-output').textContent();
const expected1 = 'https://www.port.ac.uk/study/courses/example?utm_campaign=ug2026-uop&utm_medium=email&utm_source=alumni-email&utm_term=organic-email&utm_content=newsletter';
log('UTM param order/casing matches the real historical convention', utm1 === expected1, utm1);

// ---- Test 3: "Other" source lets a brand-new source through ----
await resetPage();
await fillBatch({ paidOrganic: 'Paid' });
await fillRow(row(), {
  pageUrl: 'https://www.port.ac.uk/new-partner',
  campaign: 'test-campaign',
  gaMedium: 'affiliate',
  campaignTerm: 'paid-3rd-party-website',
  source: '__other__',
  otherSource: 'brand-new-affiliate-2026',
  campaignContent: 'banner',
});
await page.click('#generate-btn');
await page.waitForSelector('#results-section:not([hidden])');
const utm3 = await row().locator('.utm-output').textContent();
log('New/unlisted source is not blocked', utm3.includes('utm_source=brand-new-affiliate-2026'), utm3);

// ---- Test 4: required fields block generation with an inline error ----
await resetPage();
await fillBatch({ paidOrganic: 'Paid' });
await fillRow(row(), { campaign: 'x', gaMedium: 'ppc', campaignTerm: 'paid-search', source: 'google', campaignContent: 'x' }); // no Page URL
await page.click('#generate-btn');
await page.waitForSelector('#results-section:not([hidden])');
const rowErrors = await page.textContent('.row-error-list');
log('Missing required field is blocked with a named error', rowErrors.includes('Page URL is required'), rowErrors);

// ---- Test 5: bulk add from pasted URLs + fill-down ----
await resetPage();
await fillBatch({ paidOrganic: 'Paid' });
await fillRow(row(), { pageUrl: 'https://www.port.ac.uk/x', campaign: 'bulk-campaign', gaMedium: 'ppc', campaignTerm: 'paid-search', source: 'google', campaignContent: 'ad-1' });
await page.click('text=+ Add rows from a list of Page URLs');
await page.fill('#bulk-urls', 'https://www.port.ac.uk/a\nhttps://www.port.ac.uk/b\nhttps://www.port.ac.uk/c');
await page.click('#bulk-add-btn');
const rowCountAfterBulk = await page.locator('#rows-tbody tr').count();
log('Bulk-add from pasted URLs creates one row per line', rowCountAfterBulk === 4, `rows=${rowCountAfterBulk}`);

await page.click('#fill-down-btn');
const row2Medium = await row(1).locator('.row-gaMedium').inputValue();
const row2Term = await row(1).locator('.row-campaignTerm').inputValue();
log("Fill-down copies row 1's Medium/Term to other rows", row2Medium === 'ppc' && row2Term === 'paid-search', `medium=${row2Medium} term=${row2Term}`);

await page.click('#generate-btn');
await page.waitForSelector('#results-section:not([hidden])');
const summary5 = await page.textContent('#results-summary');
log('Bulk batch (fill-down applied) is fully valid', summary5.includes('4 valid'), summary5);

// ---- Test 6: a 150-row batch generates without loss ----
await resetPage();
await fillBatch({ paidOrganic: 'Paid' });
await fillRow(row(), { pageUrl: 'https://www.port.ac.uk/page-0', campaign: 'perf-test', gaMedium: 'ppc', campaignTerm: 'paid-search', source: 'google', campaignContent: 'content-0' });
const n = 150;
const urls = Array.from({ length: n - 1 }, (_, i) => `https://www.port.ac.uk/page-${i + 1}`).join('\n');
await page.click('text=+ Add rows from a list of Page URLs');
await page.fill('#bulk-urls', urls);
await page.click('#bulk-add-btn');
await page.click('#fill-down-btn');
const t0 = Date.now();
await page.click('#generate-btn');
await page.waitForSelector('#results-section:not([hidden])');
const elapsed = Date.now() - t0;
const rowCount150 = await page.locator('#rows-tbody tr').count();
const summary150 = await page.textContent('#results-summary');
log('150-row batch generates all 150 rows without loss', rowCount150 === n && summary150.includes('150 valid'), `rows=${rowCount150}, summary="${summary150}", elapsed=${elapsed}ms`);

// ---- Test 7: duplicate detection (within batch + against shared view) ----
await resetPage();
await fillBatch({ paidOrganic: 'Paid' });
await fillRow(row(), { pageUrl: 'https://www.port.ac.uk/dup', campaign: 'dup-camp', gaMedium: 'ppc', campaignTerm: 'paid-search', source: 'google', campaignContent: 'dup-content' });
await page.click('#add-row-btn');
await fillRow(row(1), { pageUrl: 'https://www.port.ac.uk/dup', campaign: 'dup-camp', gaMedium: 'ppc', campaignTerm: 'paid-search', source: 'google', campaignContent: 'dup-content' });
await page.click('#generate-btn');
await page.waitForSelector('#results-section:not([hidden])');
const warnBadges = await page.locator('.badge-warn').count();
log('Within-batch duplicate flagged', warnBadges === 1, `warn badges=${warnBadges}`);

await page.click('#confirm-open-btn');
await page.click('#confirm-yes-btn');
await page.waitForFunction(() => document.getElementById('confirm-dialog').hidden === true);

await reloadKeepingStorage();
await fillBatch({ paidOrganic: 'Paid' });
await fillRow(row(), { pageUrl: 'https://www.port.ac.uk/dup', campaign: 'dup-camp', gaMedium: 'ppc', campaignTerm: 'paid-search', source: 'google', campaignContent: 'dup-content' });
await page.click('#generate-btn');
await page.waitForSelector('#results-section:not([hidden])');
const dupNote = await page.textContent('.row-duplicate-note');
log('Duplicate against shared view detected', dupNote.includes('Already exists in the shared view'), dupNote);

// ---- Test 8: cancelled confirmation writes nothing ----
await resetPage();
await fillBatch({ paidOrganic: 'Paid' });
await fillRow(row(), { pageUrl: 'https://www.port.ac.uk/cancel-test', campaign: 'cancel-camp', gaMedium: 'ppc', campaignTerm: 'paid-search', source: 'google', campaignContent: 'x' });
await page.click('#generate-btn');
await page.waitForSelector('#results-section:not([hidden])');
const dialogText = await page.textContent('#confirm-dialog-text');
log(
  'Confirmation text matches exactly',
  dialogText.trim() === "Are you sure you are happy with the outputted UTM's, if so, click yes and the newly generated UTM's will populate into the shared view",
  dialogText.trim()
);
await page.click('#confirm-open-btn');
await page.click('#confirm-cancel-btn');
const storedAfterCancel = await page.evaluate(() => localStorage.getItem('utm-builder:records'));
log('Cancel writes nothing to storage', storedAfterCancel === null, `stored=${storedAfterCancel}`);

// ---- Test 9: remove row (can't drop below 1) ----
await resetPage();
log('Remove is disabled with only 1 row', await row().locator('.remove-row-btn').isDisabled());
await page.click('#add-row-btn');
await page.locator('#rows-tbody tr').nth(1).locator('.remove-row-btn').click();
const rowsAfterRemove = await page.locator('#rows-tbody tr').count();
log('Row removed back down to 1', rowsAfterRemove === 1, `rows=${rowsAfterRemove}`);

// ---- Test 10: keyboard-only pass ----
await resetPage();
await page.keyboard.press('Tab');
const skipLinkFocused = await page.evaluate(() => document.activeElement.className);
log('Skip link is first focusable element', skipLinkFocused.includes('skip-link'), skipLinkFocused);

await fillBatch({ paidOrganic: 'Paid' });
await fillRow(row(), { pageUrl: 'https://www.port.ac.uk/kb-test', campaign: 'kb-camp', gaMedium: 'ppc', campaignTerm: 'paid-search', source: 'google', campaignContent: 'x' });
await page.focus('#generate-btn');
await page.keyboard.press('Enter');
await page.waitForSelector('#results-section:not([hidden])');

await page.focus('#confirm-open-btn');
await page.keyboard.press('Enter');
await page.waitForSelector('#confirm-dialog:not([hidden])');
const focusOnOpen = await page.evaluate(() => document.activeElement.id);
log('Dialog opens with focus moved inside it', focusOnOpen === 'confirm-cancel-btn', focusOnOpen);
await page.keyboard.press('Tab');
const focusAfterTab = await page.evaluate(() => document.activeElement.id);
log('Tab cycles within dialog', focusAfterTab === 'confirm-yes-btn', focusAfterTab);
await page.keyboard.press('Escape');
const dialogHiddenAfterEsc = await page.getAttribute('#confirm-dialog', 'hidden');
log('Escape closes the dialog without writing', dialogHiddenAfterEsc !== null, `hidden=${dialogHiddenAfterEsc}`);
const focusAfterEsc = await page.evaluate(() => document.activeElement.id);
log('Focus returns to the opener button', focusAfterEsc === 'confirm-open-btn', focusAfterEsc);

// ---- Shared view: filters (unchanged page, sanity re-check) ----
await resetPage();
await fillBatch({ setUpBy: 'Alice', paidOrganic: 'Paid' });
await fillRow(row(), { pageUrl: 'https://www.port.ac.uk/alice', campaign: 'alice-camp', gaMedium: 'ppc', campaignTerm: 'paid-search', source: 'google', campaignContent: 'x' });
await page.click('#generate-btn');
await page.waitForSelector('#results-section:not([hidden])');
await page.click('#confirm-open-btn');
await page.click('#confirm-yes-btn');
await page.waitForFunction(() => document.getElementById('confirm-dialog').hidden === true);

await page.goto(`${BASE}/shared.html`);
await page.waitForSelector('.results-table');
const sharedRows = await page.locator('.results-table tbody tr').count();
log('Confirmed UTM appears in shared view without further action', sharedRows === 1, `rows=${sharedRows}`);

await browser.close();
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
if (failed.length > 0) {
  console.log('FAILURES:', failed.map((f) => f.name));
  process.exit(1);
}
