import { MEDIUM_OPTIONS, getTermsForMedium, getCampaignOptions, getContentOptions, getSourcesForTerm, loadRuleOverrides } from './rulesOverrides.js';
import { generateBatch } from './generator.js';
import { escapeHtml, generateId, rowsToCsv, downloadFile } from './utils.js';
import { dataAccess } from './dataAccess.js';

const OTHER_CAMPAIGN = '__other__';
const OTHER_SOURCE = '__other__';
const OTHER_CONTENT = '__other__';

const ICON_CHECK = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
const ICON_WARN = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l10 18H2L12 3z"/><line x1="12" y1="10" x2="12" y2="14"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
const ICON_COPY = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 01-1-1V4a1 1 0 011-1h10a1 1 0 011 1v1"/></svg>';
const ICON_COPIED = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
const ICON_CHEVRON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';
const ICON_DUPLICATE = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 01-1-1V4a1 1 0 011-1h10a1 1 0 011 1v1"/></svg>';
const ICON_REMOVE = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>';

const form = document.getElementById('builder-form');
const rowsList = document.getElementById('rows-list');
const rowsStatusRegion = document.getElementById('rows-status-region');
const statusRegion = document.getElementById('status-region');
const resultsSection = document.getElementById('results-section');
const resultsSummary = document.getElementById('results-summary');
const saveSuccessNote = document.getElementById('save-success-note');
const confirmOpenBtn = document.getElementById('confirm-open-btn');
const confirmDialog = document.getElementById('confirm-dialog');
const confirmYesBtn = document.getElementById('confirm-yes-btn');
const confirmCancelBtn = document.getElementById('confirm-cancel-btn');

let rowIdCounter = 0;
let lastResults = [];
let lastBatch = null;
let openerBeforeDialog = null;

function announce(message) {
  statusRegion.textContent = message;
}
function announceRows(message) {
  rowsStatusRegion.textContent = message;
}

function fillSelect(selectEl, options, { placeholder, preserveValue } = {}) {
  const previous = preserveValue !== undefined ? preserveValue : selectEl.value;
  selectEl.innerHTML = '';
  const placeholderOption = document.createElement('option');
  placeholderOption.value = '';
  placeholderOption.textContent = placeholder;
  selectEl.appendChild(placeholderOption);
  for (const opt of options) {
    const optionEl = document.createElement('option');
    optionEl.value = opt.value;
    optionEl.textContent = opt.label;
    selectEl.appendChild(optionEl);
  }
  selectEl.value = options.some((o) => o.value === previous) ? previous : '';
  return selectEl.value === previous;
}

// ---- Campaign: flat alphabetical list + "Other" ----
function populateCampaignOptions(row, preserveValue) {
  const select = row.querySelector('.row-campaign');
  const other = row.querySelector('.row-campaign-other');
  const options = getCampaignOptions().map((c) => ({ value: c, label: c }));
  options.push({ value: OTHER_CAMPAIGN, label: 'Other (new campaign)…' });
  const kept = fillSelect(select, options, { placeholder: 'Select…', preserveValue });
  const isOther = kept && select.value === OTHER_CAMPAIGN;
  other.hidden = !isOther;
  if (!isOther) other.value = '';
}

// ---- Campaign Content: flat alphabetical list + "Other" (not gated by anything) ----
function populateContentOptions(row, preserveValue) {
  const select = row.querySelector('.row-campaignContent');
  const other = row.querySelector('.row-campaignContent-other');
  const options = getContentOptions().map((c) => ({ value: c, label: c }));
  options.push({ value: OTHER_CONTENT, label: 'Other (new content)…' });
  const kept = fillSelect(select, options, { placeholder: 'Select…', preserveValue });
  const isOther = kept && select.value === OTHER_CONTENT;
  other.hidden = !isOther;
  if (!isOther) other.value = '';
}

// ---- Medium -> Term -> Source cascade ----

function populateMediumOptions(row, preserveValue) {
  const select = row.querySelector('.row-gaMedium');
  const kept = fillSelect(select, MEDIUM_OPTIONS.map((m) => ({ value: m, label: m })), {
    placeholder: 'Select…',
    preserveValue,
  });
  populateTermOptions(row, kept ? select.value : '');
}

function populateTermOptions(row, preserveValue) {
  const mediumSelect = row.querySelector('.row-gaMedium');
  const termSelect = row.querySelector('.row-campaignTerm');
  const terms = mediumSelect.value ? getTermsForMedium(mediumSelect.value) : [];
  const kept = fillSelect(termSelect, terms.map((t) => ({ value: t, label: t })), {
    placeholder: mediumSelect.value ? 'Select…' : 'Select a Medium first…',
    preserveValue,
  });
  termSelect.disabled = terms.length === 0;
  populateSourceOptions(row, kept ? termSelect.value : '');
}

function populateSourceOptions(row, preserveValue) {
  const termSelect = row.querySelector('.row-campaignTerm');
  const sourceSelect = row.querySelector('.row-source');
  const sourceOther = row.querySelector('.row-source-other');
  const sources = termSelect.value ? getSourcesForTerm(termSelect.value) : [];
  const options = sources.map((s) => ({ value: s, label: s }));
  if (termSelect.value) options.push({ value: OTHER_SOURCE, label: 'Other (new source)…' });
  const kept = fillSelect(sourceSelect, options, {
    placeholder: termSelect.value ? 'Select…' : 'Select a Term first…',
    preserveValue,
  });
  sourceSelect.disabled = !termSelect.value;
  const isOther = kept && sourceSelect.value === OTHER_SOURCE;
  sourceOther.hidden = !isOther;
  if (!isOther) sourceOther.value = '';
}

function setRowExpanded(row, expanded) {
  const toggle = row.querySelector('.row-toggle');
  row.querySelector('.row-details').hidden = !expanded;
  toggle.setAttribute('aria-expanded', String(expanded));
  const rowNumber = row.dataset.number || '';
  toggle.setAttribute('aria-label', `${expanded ? 'Collapse' : 'Expand'} row ${rowNumber}`.trim());
}

/** Recomputes the collapsed-row summary text from the row's current field values. */
function updateRowSummary(row) {
  const data = getRowData(row);
  const parts = [data.campaign, data.gaMedium, data.campaignTerm, data.source, data.campaignContent].filter(Boolean);
  row.querySelector('.row-summary').textContent = parts.length > 0 ? parts.join(' · ') : 'Not started yet';
}

function updateRowNumbers() {
  const rows = [...rowsList.querySelectorAll('.row-card')];
  rows.forEach((row, i) => {
    const rowNumber = i + 1;
    row.dataset.number = String(rowNumber);
    row.querySelector('.row-number').textContent = String(rowNumber);
    row.querySelectorAll('[data-label]').forEach((el) => {
      el.setAttribute('aria-label', `${el.dataset.label}, row ${rowNumber}`);
    });
    const toggle = row.querySelector('.row-toggle');
    const expanded = toggle.getAttribute('aria-expanded') === 'true';
    toggle.setAttribute('aria-label', `${expanded ? 'Collapse' : 'Expand'} row ${rowNumber}`);
  });
  document.querySelectorAll('.remove-row-btn').forEach((btn) => {
    btn.disabled = rows.length <= 1;
  });
}

function clearRowResult(row) {
  delete row.dataset.status;
  row.querySelector('.row-status').innerHTML = '';
  const copyBtn = row.querySelector('.copy-utm-btn');
  copyBtn.hidden = true;
  delete copyBtn.dataset.utm;
  const errorListEl = row.querySelector('.row-error-list');
  errorListEl.hidden = true;
  errorListEl.innerHTML = '';
  const utmOutputEl = row.querySelector('.row-utm-output');
  utmOutputEl.hidden = true;
  utmOutputEl.innerHTML = '';
  row.querySelectorAll('input, select').forEach((el) => el.removeAttribute('aria-invalid'));
}

function createRowElement() {
  rowIdCounter += 1;
  const id = rowIdCounter;
  const row = document.createElement('div');
  row.className = 'row-card';
  row.dataset.rowId = String(id);
  row.innerHTML = `
    <div class="row-header">
      <span class="row-number">1</span>
      <button type="button" class="row-toggle" aria-expanded="true" aria-controls="row-details-${id}">${ICON_CHEVRON}</button>
      <input type="text" class="row-pageUrl" data-label="Page URL" placeholder="Page URL" />
      <span class="row-summary">Not started yet</span>
      <span class="row-status"></span>
      <div class="row-actions">
        <button type="button" class="btn-icon copy-utm-btn" aria-label="Copy generated UTM" hidden>${ICON_COPY}</button>
        <button type="button" class="btn-icon duplicate-row-btn" data-label="Duplicate row" aria-label="Duplicate row">${ICON_DUPLICATE}</button>
        <button type="button" class="btn-icon btn-icon-danger remove-row-btn" data-label="Remove row" aria-label="Remove row">${ICON_REMOVE}</button>
      </div>
    </div>
    <div class="row-details" id="row-details-${id}">
      <div class="row-fields-grid">
        <div class="field">
          <label>Campaign</label>
          <select class="row-campaign" data-label="Campaign"></select>
          <input type="text" class="row-campaign-other" data-label="New campaign" placeholder="Type new campaign" hidden />
        </div>
        <div class="field">
          <label>GA4 Medium</label>
          <select class="row-gaMedium" data-label="GA4 Medium"></select>
        </div>
        <div class="field">
          <label>Campaign Term</label>
          <select class="row-campaignTerm" data-label="Campaign Term"></select>
        </div>
        <div class="field">
          <label>Source</label>
          <select class="row-source" data-label="Source"></select>
          <input type="text" class="row-source-other" data-label="New source" placeholder="Type new source" hidden />
        </div>
        <div class="field">
          <label>Campaign Content</label>
          <select class="row-campaignContent" data-label="Campaign Content"></select>
          <input type="text" class="row-campaignContent-other" data-label="New content" placeholder="Type new content" hidden />
        </div>
      </div>
      <ul class="row-error-list" hidden></ul>
      <div class="row-utm-output" hidden></div>
    </div>
  `;

  function onFieldChanged() {
    clearRowResult(row);
    updateRowSummary(row);
  }

  row.querySelector('.row-campaign').addEventListener('change', (e) => {
    const other = row.querySelector('.row-campaign-other');
    const isOther = e.target.value === OTHER_CAMPAIGN;
    other.hidden = !isOther;
    if (isOther) other.focus();
    else other.value = '';
    onFieldChanged();
  });
  row.querySelector('.row-gaMedium').addEventListener('change', () => {
    populateTermOptions(row, '');
    onFieldChanged();
  });
  row.querySelector('.row-campaignTerm').addEventListener('change', () => {
    populateSourceOptions(row, '');
    onFieldChanged();
  });
  row.querySelector('.row-source').addEventListener('change', (e) => {
    const sourceOther = row.querySelector('.row-source-other');
    const isOther = e.target.value === OTHER_SOURCE;
    sourceOther.hidden = !isOther;
    if (isOther) sourceOther.focus();
    else sourceOther.value = '';
    onFieldChanged();
  });
  row.querySelector('.row-campaignContent').addEventListener('change', (e) => {
    const contentOther = row.querySelector('.row-campaignContent-other');
    const isOther = e.target.value === OTHER_CONTENT;
    contentOther.hidden = !isOther;
    if (isOther) contentOther.focus();
    else contentOther.value = '';
    onFieldChanged();
  });
  row.querySelectorAll('.row-pageUrl, .row-campaign-other, .row-source-other, .row-campaignContent-other').forEach((el) => {
    el.addEventListener('input', onFieldChanged);
  });

  row.querySelector('.row-toggle').addEventListener('click', () => {
    const expanded = row.querySelector('.row-toggle').getAttribute('aria-expanded') === 'true';
    setRowExpanded(row, !expanded);
  });

  row.querySelector('.copy-utm-btn').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const utm = btn.dataset.utm;
    if (!utm) return;
    await navigator.clipboard.writeText(utm);
    btn.innerHTML = ICON_COPIED;
    btn.setAttribute('aria-label', 'Copied');
    setTimeout(() => {
      btn.innerHTML = ICON_COPY;
      btn.setAttribute('aria-label', 'Copy generated UTM');
    }, 1500);
  });

  row.querySelector('.duplicate-row-btn').addEventListener('click', () => {
    duplicateRow(row);
  });
  row.querySelector('.remove-row-btn').addEventListener('click', () => {
    if (rowsList.querySelectorAll('.row-card').length <= 1) return;
    row.remove();
    updateRowNumbers();
    announceRows('Row removed.');
  });

  populateCampaignOptions(row, '');
  populateMediumOptions(row, '');
  populateContentOptions(row, '');
  return row;
}

function addRow(prefill = {}) {
  const row = createRowElement();
  rowsList.appendChild(row);
  if (prefill.pageUrl) row.querySelector('.row-pageUrl').value = prefill.pageUrl;
  updateRowSummary(row);
  updateRowNumbers();
  return row;
}

/** Inserts a copy of `row` immediately after it, with the same Page URL and cascading selects (including any "Other" free-text values). Starts expanded, like any new row. */
function duplicateRow(row) {
  const data = getRowData(row);
  const newRow = createRowElement();
  newRow.querySelector('.row-pageUrl').value = data.pageUrl;
  copySelectOrOther(newRow, '.row-campaign', '.row-campaign-other', OTHER_CAMPAIGN, data.campaign);
  populateMediumOptions(newRow, data.gaMedium);
  populateTermOptions(newRow, data.campaignTerm);
  copySelectOrOther(newRow, '.row-source', '.row-source-other', OTHER_SOURCE, data.source);
  copySelectOrOther(newRow, '.row-campaignContent', '.row-campaignContent-other', OTHER_CONTENT, data.campaignContent);
  updateRowSummary(newRow);
  row.after(newRow);
  updateRowNumbers();
  announceRows('Row duplicated.');
}

function getRowData(row) {
  const campaignSelect = row.querySelector('.row-campaign');
  const campaignOther = row.querySelector('.row-campaign-other');
  const campaign = campaignSelect.value === OTHER_CAMPAIGN ? campaignOther.value.trim() : campaignSelect.value;

  const sourceSelect = row.querySelector('.row-source');
  const sourceOther = row.querySelector('.row-source-other');
  const source = sourceSelect.value === OTHER_SOURCE ? sourceOther.value.trim() : sourceSelect.value;

  const contentSelect = row.querySelector('.row-campaignContent');
  const contentOther = row.querySelector('.row-campaignContent-other');
  const campaignContent = contentSelect.value === OTHER_CONTENT ? contentOther.value.trim() : contentSelect.value;

  return {
    pageUrl: row.querySelector('.row-pageUrl').value.trim(),
    campaign,
    gaMedium: row.querySelector('.row-gaMedium').value,
    campaignTerm: row.querySelector('.row-campaignTerm').value,
    source,
    campaignContent,
  };
}

function writeRowResult(row, result) {
  const statusEl = row.querySelector('.row-status');
  const copyBtn = row.querySelector('.copy-utm-btn');
  const errorListEl = row.querySelector('.row-error-list');
  const utmOutputEl = row.querySelector('.row-utm-output');

  if (result.errors.length > 0) {
    row.dataset.status = 'error';
    statusEl.innerHTML = '<span class="pill pill-error">Error</span>';
    copyBtn.hidden = true;
    delete copyBtn.dataset.utm;
    errorListEl.hidden = false;
    errorListEl.innerHTML = result.errors.map((e) => `<li>${escapeHtml(e.message)}</li>`).join('');
    utmOutputEl.hidden = true;
    utmOutputEl.innerHTML = '';
    for (const err of result.errors) {
      const fieldEl = row.querySelector(`.row-${err.field}`);
      if (fieldEl) fieldEl.setAttribute('aria-invalid', 'true');
    }
    // Errors need to be seen without an extra click — the header pill alone doesn't say which field is wrong.
    setRowExpanded(row, true);
    return;
  }

  row.dataset.status = result.isDuplicate ? 'duplicate' : 'valid';
  statusEl.innerHTML = result.isDuplicate
    ? `<span class="pill pill-warn">${ICON_WARN} Duplicate</span>`
    : `<span class="pill pill-valid">${ICON_CHECK} Valid</span>`;
  errorListEl.hidden = true;
  errorListEl.innerHTML = '';
  const dupNote = result.isDuplicate ? `<p class="row-duplicate-note">${escapeHtml(result.duplicateReason)}</p>` : '';
  utmOutputEl.hidden = false;
  utmOutputEl.innerHTML = `${dupNote}<code class="utm-output">${escapeHtml(result.utm)}</code>`;
  copyBtn.hidden = false;
  copyBtn.dataset.utm = result.utm;
}

document.getElementById('add-row-btn').addEventListener('click', () => {
  addRow();
  announceRows('Row added.');
});

document.getElementById('bulk-add-btn').addEventListener('click', () => {
  const textarea = document.getElementById('bulk-urls');
  const lines = textarea.value
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  lines.forEach((url) => addRow({ pageUrl: url }));
  textarea.value = '';
  announceRows(`${lines.length} row(s) added.`);
});

/** Copies a select+"Other" field's resolved value to another row, using the target row's own option list. */
function copySelectOrOther(row, selectClass, otherClass, otherSentinel, value) {
  const select = row.querySelector(selectClass);
  const other = row.querySelector(otherClass);
  const isKnown = [...select.options].some((o) => o.value === value);
  if (isKnown) {
    select.value = value;
    other.hidden = true;
    other.value = '';
  } else if (value) {
    select.value = otherSentinel;
    other.hidden = false;
    other.value = value;
  }
}

document.getElementById('clear-btn').addEventListener('click', () => {
  form.reset();
  rowsList.innerHTML = '';
  addRow();
  resultsSection.hidden = true;
  saveSuccessNote.hidden = true;
  lastResults = [];
  lastBatch = null;
  announce('Form cleared.');
});

function getBatch() {
  return {
    setUpBy: document.getElementById('setUpBy').value.trim(),
    date: document.getElementById('date').value,
  };
}

function validateBatchFields(batch) {
  const errors = [];
  if (!batch.setUpBy) errors.push({ field: 'setUpBy', message: 'Set Up By is required.' });
  if (!batch.date) errors.push({ field: 'date', message: 'Date is required.' });
  return errors;
}

function clearBatchFieldErrors() {
  for (const key of ['setUpBy', 'date']) {
    const el = document.getElementById(`${key}-errors`);
    if (el) el.innerHTML = '';
  }
}

function renderBatchFieldErrors(errors) {
  for (const err of errors) {
    const el = document.getElementById(`${err.field}-errors`);
    if (el) el.innerHTML = `<li>${escapeHtml(err.message)}</li>`;
  }
}

function summarize(results) {
  const errorCount = results.filter((r) => r.errors.length > 0).length;
  const duplicateCount = results.filter((r) => r.errors.length === 0 && r.isDuplicate).length;
  const validCount = results.length - errorCount - duplicateCount;
  const pills = [`<span class="pill pill-stat pill-neutral">${results.length} row${results.length === 1 ? '' : 's'} generated</span>`];
  if (validCount > 0) pills.push(`<span class="pill pill-stat pill-valid">${validCount} valid</span>`);
  if (duplicateCount > 0) pills.push(`<span class="pill pill-stat pill-warn">${duplicateCount} duplicate${duplicateCount === 1 ? '' : 's'}</span>`);
  if (errorCount > 0) pills.push(`<span class="pill pill-stat pill-error">${errorCount} with error${errorCount === 1 ? '' : 's'}</span>`);
  return pills.join('');
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearBatchFieldErrors();
  resultsSection.hidden = true;
  saveSuccessNote.hidden = true;

  const batch = getBatch();
  const batchErrors = validateBatchFields(batch);
  if (batchErrors.length > 0) {
    renderBatchFieldErrors(batchErrors);
    announce('The form has errors. Please review the highlighted fields.');
    document.getElementById(batchErrors[0].field).focus();
    return;
  }

  let existing = [];
  try {
    existing = (await dataAccess.list()).map((r) => r.utm);
  } catch (err) {
    console.warn('Could not load shared view for duplicate check:', err);
  }

  const rowEls = [...rowsList.querySelectorAll('.row-card')];
  const rowsData = rowEls.map((row) => getRowData(row));
  const { results } = generateBatch(rowsData, existing);

  rowEls.forEach((row, i) => writeRowResult(row, results[i]));

  lastResults = results;
  lastBatch = batch;

  resultsSummary.innerHTML = summarize(results);
  resultsSection.hidden = false;
  confirmOpenBtn.disabled = !results.some((r) => r.errors.length === 0 && r.utm);
  announce(resultsSummary.textContent);
  resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

document.getElementById('copy-all-btn').addEventListener('click', async () => {
  const utms = lastResults.filter((r) => r.errors.length === 0 && r.utm).map((r) => r.utm);
  await navigator.clipboard.writeText(utms.join('\n'));
  announce(`${utms.length} UTM(s) copied to clipboard.`);
});

document.getElementById('export-csv-btn').addEventListener('click', () => {
  const headers = ['Row', 'Status', 'Set Up By', 'Date', 'Page URL', 'Campaign', 'GA4 Medium', 'Campaign Term', 'Source', 'Campaign Content', 'Generated UTM', 'Errors'];
  const rows = lastResults.map((r) => [
    r.index + 1,
    r.errors.length > 0 ? 'Error' : r.isDuplicate ? 'Duplicate' : 'Valid',
    lastBatch.setUpBy,
    lastBatch.date,
    r.row.pageUrl,
    r.row.campaign,
    r.row.gaMedium,
    r.row.campaignTerm,
    r.row.source,
    r.row.campaignContent,
    r.utm || '',
    r.errors.map((e) => e.message).join(' | '),
  ]);
  downloadFile(`utm-batch-${lastBatch.date || 'export'}.csv`, rowsToCsv(headers, rows));
});

function openConfirmDialog() {
  openerBeforeDialog = document.activeElement;
  confirmDialog.hidden = false;
  confirmCancelBtn.focus();
  document.addEventListener('keydown', onDialogKeydown);
}
function closeConfirmDialog() {
  confirmDialog.hidden = true;
  document.removeEventListener('keydown', onDialogKeydown);
  if (openerBeforeDialog) openerBeforeDialog.focus();
}
function onDialogKeydown(event) {
  if (event.key === 'Escape') {
    event.preventDefault();
    closeConfirmDialog();
    return;
  }
  if (event.key === 'Tab') {
    const focusable = [confirmYesBtn, confirmCancelBtn];
    const currentIndex = focusable.indexOf(document.activeElement);
    event.preventDefault();
    const nextIndex = event.shiftKey ? (currentIndex - 1 + focusable.length) % focusable.length : (currentIndex + 1) % focusable.length;
    focusable[nextIndex].focus();
  }
}

confirmOpenBtn.addEventListener('click', openConfirmDialog);
confirmCancelBtn.addEventListener('click', () => {
  closeConfirmDialog();
  announce('Cancelled. Nothing was added to the shared view.');
});

confirmYesBtn.addEventListener('click', async () => {
  const validRows = lastResults.filter((r) => r.errors.length === 0 && r.utm);
  const records = validRows.map((r) => ({
    id: generateId(),
    setUpBy: lastBatch.setUpBy,
    date: lastBatch.date,
    pageUrl: r.row.pageUrl,
    campaign: r.row.campaign,
    gaMedium: r.row.gaMedium,
    campaignTerm: r.row.campaignTerm,
    source: r.row.source,
    campaignContent: r.row.campaignContent,
    utm: r.utm,
    createdAt: new Date().toISOString(),
  }));

  try {
    await dataAccess.append(records);
    closeConfirmDialog();
    confirmOpenBtn.disabled = true;
    saveSuccessNote.hidden = false;
    announce(`${records.length} UTM(s) added to the shared view.`);
  } catch (err) {
    closeConfirmDialog();
    announce(`Could not save to the shared view: ${err.message}`);
  }
});

await loadRuleOverrides();
addRow();
