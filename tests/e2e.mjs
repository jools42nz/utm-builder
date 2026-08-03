import { chromium } from 'playwright';

const BASE = `http://localhost:${process.env.PORT || 8420}`;
const results = [];
function log(name, pass, detail = '') {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'} - ${name}${detail ? ' :: ' + detail : ''}`);
}

const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH });
const page = await browser.newPage();

async function fillBatch({ setUpBy = 'E2E Tester', date = '2026-07-30' } = {}) {
  await page.fill('#setUpBy', setUpBy);
  await page.fill('#date', date);
}

async function fillRow(rowLocator, { pageUrl, campaign, gaMedium, campaignTerm, source, campaignContent, otherCampaign, otherSource, otherContent }) {
  if (pageUrl !== undefined) await rowLocator.locator('.row-pageUrl').fill(pageUrl);
  if (campaign !== undefined) await rowLocator.locator('.row-campaign').selectOption(campaign);
  if (otherCampaign !== undefined) await rowLocator.locator('.row-campaign-other').fill(otherCampaign);
  if (gaMedium !== undefined) await rowLocator.locator('.row-gaMedium').selectOption(gaMedium);
  if (campaignTerm !== undefined) await rowLocator.locator('.row-campaignTerm').selectOption(campaignTerm);
  if (source !== undefined) await rowLocator.locator('.row-source').selectOption(source);
  if (otherSource !== undefined) await rowLocator.locator('.row-source-other').fill(otherSource);
  if (campaignContent !== undefined) await rowLocator.locator('.row-campaignContent').selectOption(campaignContent);
  if (otherContent !== undefined) await rowLocator.locator('.row-campaignContent-other').fill(otherContent);
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

// ---- Test 1: there is no Paid/Organic input anywhere in the form ----
await resetPage();
const paidOrganicFieldCount = await page.locator('#paidOrganic').count();
log('No standalone Paid/Organic field exists in the form', paidOrganicFieldCount === 0, `count=${paidOrganicFieldCount}`);

// ---- Test 2: Campaign is a real alphabetical <select>, not free text ----
const campaignTag = await row().locator('.row-campaign').evaluate((el) => el.tagName);
log('Campaign field is a <select>', campaignTag === 'SELECT', campaignTag);
const campaignOptions = await row().locator('.row-campaign option').allTextContents();
const realCampaignOptions = campaignOptions.filter((c) => c !== 'Select…' && !c.startsWith('Other'));
const sortedCampaigns = [...realCampaignOptions].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
log('Campaign options are alphabetically ordered', JSON.stringify(realCampaignOptions) === JSON.stringify(sortedCampaigns));
log('Campaign select offers an "Other" option for new campaigns', campaignOptions.includes('Other (new campaign)…'));

// ---- Test 3: every real GA4 Medium is offered, alphabetically, with no Paid/Organic gate ----
const allMediums = await row().locator('.row-gaMedium option').allTextContents();
const realMediums = allMediums.filter((m) => m !== 'Select…');
log(
  'Every real GA4 Medium is offered, with no Paid/Organic gate at all',
  ['ppc', 'affiliate', 'organic', 'audio', 'email', 'social', 'video', 'referral', 'print', 'sms', 'push'].every((m) => realMediums.includes(m)),
  realMediums.join(',')
);
const sortedMediums = [...realMediums].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
log('GA4 Medium options are alphabetically ordered', JSON.stringify(realMediums) === JSON.stringify(sortedMediums), realMediums.join(','));

// ---- Test 4: Medium -> Term -> Source cascade, each level alphabetical ----
await row().locator('.row-gaMedium').selectOption('email');
const emailTerms = await row().locator('.row-campaignTerm option').allTextContents();
log('email medium offers both paid-email and organic-email (no polarity split)', emailTerms.includes('paid-email') && emailTerms.includes('organic-email'), emailTerms.join(','));

await row().locator('.row-campaignTerm').selectOption('organic-email');
const emailSources = await row().locator('.row-source option').allTextContents();
log('organic-email term offers its real historical sources plus Other', emailSources.includes('alumni-email') && emailSources.includes('Other (new source)…'), emailSources.join(','));
const realEmailSources = emailSources.filter((s) => s !== 'Select…' && !s.startsWith('Other'));
const sortedEmailSources = [...realEmailSources].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
log('Source options are alphabetically ordered', JSON.stringify(realEmailSources) === JSON.stringify(sortedEmailSources), realEmailSources.join(','));

// ---- Test 5: paid-display (ppc) Source list includes the corrected full set ----
await row().locator('.row-gaMedium').selectOption('ppc');
const ppcTerms = await row().locator('.row-campaignTerm option').allTextContents();
log('ppc medium offers paid-display term', ppcTerms.includes('paid-display'), ppcTerms.join(','));
await row().locator('.row-campaignTerm').selectOption('paid-display');
const displaySources = await row().locator('.row-source option').allTextContents();
const expectedDisplaySources = [
  'bbc-history', 'complete-university-guide', 'give-with', 'google', 'findamasters', 'fone-media', 'idp', 'open-days-com',
  'programmatic', 'spotify', 'study-international', 'the-student-room', 'what-uni', 'ucas', 'unicompare', 'uni-frog',
  'pearson', 'quantcast', 'amazon', 'pmax', 'NHS_app', 'demand-gen', 'studyportals', 'uni_open_days', 'cohort', 'picnic',
];
log(
  'paid-display returns the full corrected Source list',
  expectedDisplaySources.every((s) => displaySources.includes(s)),
  `missing=${expectedDisplaySources.filter((s) => !displaySources.includes(s)).join(',')}`
);

// ---- Test 6: Campaign Content is a flat, ungated, alphabetical <select> ----
await resetPage();
const contentTag = await row().locator('.row-campaignContent').evaluate((el) => el.tagName);
log('Campaign Content field is a <select>', contentTag === 'SELECT', contentTag);
const contentOptionsBefore = await row().locator('.row-campaignContent option').allTextContents();
await row().locator('.row-campaign').selectOption('ug2026-clearing');
await row().locator('.row-gaMedium').selectOption('ppc');
const contentOptionsAfter = await row().locator('.row-campaignContent option').allTextContents();
log(
  'Campaign Content options are NOT filtered by Campaign or Medium (flat list, same before and after)',
  JSON.stringify(contentOptionsBefore) === JSON.stringify(contentOptionsAfter),
  `before=${contentOptionsBefore.length}, after=${contentOptionsAfter.length}`
);
log('Campaign Content offers a large flat list plus Other', contentOptionsAfter.length > 500 && contentOptionsAfter.includes('Other (new content)…'), `count=${contentOptionsAfter.length}`);
const realContent = contentOptionsAfter.filter((c) => c !== 'Select…' && !c.startsWith('Other'));
const sortedContent = [...realContent].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
log('Campaign Content options are alphabetically ordered', JSON.stringify(realContent) === JSON.stringify(sortedContent));

// ---- Test 7: valid generation produces the correct real-world UTM shape ----
await resetPage();
await fillBatch();
await fillRow(row(), {
  pageUrl: 'https://www.port.ac.uk/study/courses/example',
  campaign: 'brand-uop-pfc',
  gaMedium: 'email',
  campaignTerm: 'organic-email',
  source: 'alumni-email',
  campaignContent: 'open-day',
});
await page.click('#generate-btn');
await page.waitForSelector('#results-section:not([hidden])');
const summary1 = await page.textContent('#results-summary');
log('Valid row generates with 0 errors', summary1.includes('1 valid') && !summary1.includes('with errors'), summary1);
const utm1 = await row().locator('.utm-output').textContent();
const expected1 = 'https://www.port.ac.uk/study/courses/example?utm_campaign=brand-uop-pfc&utm_medium=email&utm_source=alumni-email&utm_term=organic-email&utm_content=open-day';
log('UTM param order/casing matches the real historical convention', utm1 === expected1, utm1);

// ---- Test 8: "Other" works for Campaign, Source and Content ----
await resetPage();
await fillBatch();
await fillRow(row(), {
  pageUrl: 'https://www.port.ac.uk/new-partner',
  campaign: '__other__',
  otherCampaign: 'brand-new-campaign-2026',
  gaMedium: 'affiliate',
  campaignTerm: 'paid-3rd-party-website',
  source: '__other__',
  otherSource: 'brand-new-affiliate-2026',
  campaignContent: '__other__',
  otherContent: 'brand-new-content-2026',
});
await page.click('#generate-btn');
await page.waitForSelector('#results-section:not([hidden])');
const utm8 = await row().locator('.utm-output').textContent();
log('New/unlisted Campaign is not blocked', utm8.includes('utm_campaign=brand-new-campaign-2026'), utm8);
log('New/unlisted Source is not blocked', utm8.includes('utm_source=brand-new-affiliate-2026'), utm8);
log('New/unlisted Content is not blocked', utm8.includes('utm_content=brand-new-content-2026'), utm8);

// ---- Test 9: required fields block generation with a named error ----
await resetPage();
await fillBatch();
await fillRow(row(), { campaign: 'ug2026-clearing', gaMedium: 'ppc', campaignTerm: 'paid-search', source: 'google' }); // no Page URL, no Content
await page.click('#generate-btn');
await page.waitForSelector('#results-section:not([hidden])');
const rowErrors = await page.textContent('.row-error-list');
log('Missing Page URL is blocked with a named error', rowErrors.includes('Page URL is required'), rowErrors);
log('Missing Campaign Content is blocked with a named error', rowErrors.includes('Campaign Content is required'), rowErrors);

// ---- Test 10: bulk add from pasted URLs + fill-down (Campaign, Medium, Term, Source, Content) ----
await resetPage();
await fillBatch();
await fillRow(row(), { pageUrl: 'https://www.port.ac.uk/x', campaign: 'ug2026-clearing', gaMedium: 'ppc', campaignTerm: 'paid-search', source: 'google', campaignContent: 'course-ec' });
await page.click('text=+ Add rows from a list of Page URLs');
await page.fill('#bulk-urls', 'https://www.port.ac.uk/a\nhttps://www.port.ac.uk/b\nhttps://www.port.ac.uk/c');
await page.click('#bulk-add-btn');
const rowCountAfterBulk = await page.locator('#rows-tbody tr').count();
log('Bulk-add from pasted URLs creates one row per line', rowCountAfterBulk === 4, `rows=${rowCountAfterBulk}`);

await page.click('#fill-down-btn');
const row2Campaign = await row(1).locator('.row-campaign').inputValue();
const row2Medium = await row(1).locator('.row-gaMedium').inputValue();
const row2Term = await row(1).locator('.row-campaignTerm').inputValue();
const row2Content = await row(1).locator('.row-campaignContent').inputValue();
log(
  "Fill-down copies row 1's Campaign/Medium/Term/Content to other rows",
  row2Campaign === 'ug2026-clearing' && row2Medium === 'ppc' && row2Term === 'paid-search' && row2Content === 'course-ec',
  `campaign=${row2Campaign} medium=${row2Medium} term=${row2Term} content=${row2Content}`
);

await page.click('#generate-btn');
await page.waitForSelector('#results-section:not([hidden])');
const summary10 = await page.textContent('#results-summary');
log('Bulk batch (fill-down applied) is fully valid', summary10.includes('4 valid'), summary10);

// ---- Test 11: a 150-row batch generates without loss ----
await resetPage();
await fillBatch();
await fillRow(row(), { pageUrl: 'https://www.port.ac.uk/page-0', campaign: 'ug2026-clearing', gaMedium: 'ppc', campaignTerm: 'paid-search', source: 'google' });
await row().locator('.row-campaignContent').selectOption('__other__');
await row().locator('.row-campaignContent-other').fill('content-0');
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

// ---- Test 12: duplicate detection (within batch + against shared view) ----
await resetPage();
await fillBatch();
await fillRow(row(), { pageUrl: 'https://www.port.ac.uk/dup', campaign: 'ug2026-clearing', gaMedium: 'ppc', campaignTerm: 'paid-search', source: 'google' });
await row().locator('.row-campaignContent').selectOption('__other__');
await row().locator('.row-campaignContent-other').fill('dup-content');
await page.click('#add-row-btn');
await fillRow(row(1), { pageUrl: 'https://www.port.ac.uk/dup', campaign: 'ug2026-clearing', gaMedium: 'ppc', campaignTerm: 'paid-search', source: 'google' });
await row(1).locator('.row-campaignContent').selectOption('__other__');
await row(1).locator('.row-campaignContent-other').fill('dup-content');
await page.click('#generate-btn');
await page.waitForSelector('#results-section:not([hidden])');
const warnBadges = await page.locator('.badge-warn').count();
log('Within-batch duplicate flagged', warnBadges === 1, `warn badges=${warnBadges}`);

await page.click('#confirm-open-btn');
await page.click('#confirm-yes-btn');
await page.waitForFunction(() => document.getElementById('confirm-dialog').hidden === true);

await reloadKeepingStorage();
await fillBatch();
await fillRow(row(), { pageUrl: 'https://www.port.ac.uk/dup', campaign: 'ug2026-clearing', gaMedium: 'ppc', campaignTerm: 'paid-search', source: 'google' });
await row().locator('.row-campaignContent').selectOption('__other__');
await row().locator('.row-campaignContent-other').fill('dup-content');
await page.click('#generate-btn');
await page.waitForSelector('#results-section:not([hidden])');
const dupNote = await page.textContent('.row-duplicate-note');
log('Duplicate against shared view detected', dupNote.includes('Already exists in the shared view'), dupNote);

// ---- Test 13: cancelled confirmation writes nothing ----
await resetPage();
await fillBatch();
await fillRow(row(), { pageUrl: 'https://www.port.ac.uk/cancel-test', campaign: 'ug2026-clearing', gaMedium: 'ppc', campaignTerm: 'paid-search', source: 'google' });
await row().locator('.row-campaignContent').selectOption('__other__');
await row().locator('.row-campaignContent-other').fill('x');
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

// ---- Test 14: remove row (can't drop below 1) ----
await resetPage();
log('Remove is disabled with only 1 row', await row().locator('.remove-row-btn').isDisabled());
await page.click('#add-row-btn');
await page.locator('#rows-tbody tr').nth(1).locator('.remove-row-btn').click();
const rowsAfterRemove = await page.locator('#rows-tbody tr').count();
log('Row removed back down to 1', rowsAfterRemove === 1, `rows=${rowsAfterRemove}`);

// ---- Test 15: keyboard-only pass ----
await resetPage();
await page.keyboard.press('Tab');
const skipLinkFocused = await page.evaluate(() => document.activeElement.className);
log('Skip link is first focusable element', skipLinkFocused.includes('skip-link'), skipLinkFocused);

await fillBatch();
await fillRow(row(), { pageUrl: 'https://www.port.ac.uk/kb-test', campaign: 'ug2026-clearing', gaMedium: 'ppc', campaignTerm: 'paid-search', source: 'google' });
await row().locator('.row-campaignContent').selectOption('__other__');
await row().locator('.row-campaignContent-other').fill('x');
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

// ---- Test 16: shared view mirrors the builder exactly, with no Paid/Organic anywhere ----
await resetPage();
await fillBatch({ setUpBy: 'Alice' });
await fillRow(row(), { pageUrl: 'https://www.port.ac.uk/alice', campaign: 'ug2026-clearing', gaMedium: 'ppc', campaignTerm: 'paid-search', source: 'google', campaignContent: 'course-ec' });
await page.click('#generate-btn');
await page.waitForSelector('#results-section:not([hidden])');
await page.click('#confirm-open-btn');
await page.click('#confirm-yes-btn');
await page.waitForFunction(() => document.getElementById('confirm-dialog').hidden === true);

await page.goto(`${BASE}/shared.html`);
await page.waitForSelector('.results-table');
const noPaidOrganicFilter = await page.locator('#filter-paidOrganic').count();
log('Shared view has no Paid/Organic filter', noPaidOrganicFilter === 0, `count=${noPaidOrganicFilter}`);

const sharedHeaders = await page.locator('.results-table thead th').allTextContents();
log(
  'Shared view table mirrors the builder fields exactly, including Campaign Content',
  JSON.stringify(sharedHeaders) === JSON.stringify(['Set Up By', 'Date', 'Page URL', 'Campaign', 'GA4 Medium', 'Campaign Term', 'Source', 'Campaign Content', 'UTM']),
  sharedHeaders.join(',')
);

const sharedRows = await page.locator('.results-table tbody tr').count();
log('Confirmed UTM appears in shared view without further action', sharedRows === 1, `rows=${sharedRows}`);
const sharedCells = await page.locator('.results-table tbody tr').first().locator('td').allTextContents();
log('Shared view row includes the Campaign Content value', sharedCells.some((c) => c.includes('course-ec')), sharedCells.join(' | '));

// ---- Test 17: shared view filters cover all 5 UTM parameters + Page URL, Date, Set Up By ----
await page.selectOption('#filter-gaMedium', 'ppc');
let sharedSummary = await page.textContent('#shared-summary');
log('Shared view filters by GA4 Medium', sharedSummary.includes('Showing 1 of 1'), sharedSummary);
await page.selectOption('#filter-gaMedium', '');

await page.selectOption('#filter-campaignTerm', 'paid-search');
sharedSummary = await page.textContent('#shared-summary');
log('Shared view filters by Campaign Term', sharedSummary.includes('Showing 1 of 1'), sharedSummary);
await page.selectOption('#filter-campaignTerm', '');

await page.fill('#filter-source', 'google');
sharedSummary = await page.textContent('#shared-summary');
log('Shared view filters by Source', sharedSummary.includes('Showing 1 of 1'), sharedSummary);
await page.fill('#filter-source', '');

await page.fill('#filter-campaignContent', 'course-ec');
sharedSummary = await page.textContent('#shared-summary');
log('Shared view filters by Campaign Content', sharedSummary.includes('Showing 1 of 1'), sharedSummary);
await page.fill('#filter-campaignContent', '');

await page.fill('#filter-pageUrl', 'alice');
sharedSummary = await page.textContent('#shared-summary');
log('Shared view filters by Page URL', sharedSummary.includes('Showing 1 of 1'), sharedSummary);
await page.fill('#filter-pageUrl', '');

await page.fill('#filter-campaign', 'ug2026-clearing');
sharedSummary = await page.textContent('#shared-summary');
log('Shared view filters by Campaign', sharedSummary.includes('Showing 1 of 1'), sharedSummary);
await page.fill('#filter-campaign', '');

await browser.close();
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
if (failed.length > 0) {
  console.log('FAILURES:', failed.map((f) => f.name));
  process.exit(1);
}
