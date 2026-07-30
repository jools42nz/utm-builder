import { MEDIUM_OPTIONS, getTermsForMedium, getSourcesForTerm, KNOWN_CAMPAIGNS } from './rules.js';
import { generateBatch } from './generator.js';
import { escapeHtml, generateId, rowsToCsv, downloadFile } from './utils.js';
import { dataAccess } from './dataAccess.js';

const OTHER_SOURCE = '__other__';

const form = document.getElementById('builder-form');
const paidOrganicSelect = document.getElementById('paidOrganic');
const rowsTbody = document.getElementById('rows-tbody');
const rowsStatusRegion = document.getElementById('rows-status-region');
const statusRegion = document.getElementById('status-region');
const campaignSuggestions = document.getElementById('campaign-suggestions');
const resultsSection = document.getElementById('results-section');
const resultsSummary = document.getElementById('results-summary');
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

campaignSuggestions.innerHTML = KNOWN_CAMPAIGNS.map((c) => `<option value="${escapeHtml(c)}"></option>`).join('');

function currentPaidOrganic() {
  return paidOrganicSelect.value;
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

function populateMediumOptions(tr, preserveValue) {
  const select = tr.querySelector('.row-gaMedium');
  const kept = fillSelect(select, MEDIUM_OPTIONS.map((m) => ({ value: m, label: m })), {
    placeholder: 'Select…',
    preserveValue,
  });
  populateTermOptions(tr, kept ? select.value : '');
}

function termPlaceholder(mediumValue, terms) {
  if (!currentPaidOrganic()) return 'Select Paid/Organic first…';
  if (!mediumValue) return 'Select a Medium first…';
  if (terms.length === 0) return `No ${currentPaidOrganic()} terms for this medium…`;
  return 'Select…';
}

function populateTermOptions(tr, preserveValue) {
  const mediumSelect = tr.querySelector('.row-gaMedium');
  const termSelect = tr.querySelector('.row-campaignTerm');
  const terms = mediumSelect.value && currentPaidOrganic() ? getTermsForMedium(mediumSelect.value, currentPaidOrganic()) : [];
  const kept = fillSelect(termSelect, terms.map((t) => ({ value: t, label: t })), {
    placeholder: termPlaceholder(mediumSelect.value, terms),
    preserveValue,
  });
  termSelect.disabled = terms.length === 0;
  populateSourceOptions(tr, kept ? termSelect.value : '');
}

function populateSourceOptions(tr, preserveValue) {
  const termSelect = tr.querySelector('.row-campaignTerm');
  const sourceSelect = tr.querySelector('.row-source');
  const sourceOther = tr.querySelector('.row-source-other');
  const sources = termSelect.value ? getSourcesForTerm(termSelect.value) : [];
  const options = sources.map((s) => ({ value: s, label: s }));
  options.push({ value: OTHER_SOURCE, label: 'Other (new source)…' });
  const kept = fillSelect(sourceSelect, options, {
    placeholder: termSelect.value ? 'Select…' : 'Select a Term first…',
    preserveValue,
  });
  sourceSelect.disabled = !termSelect.value;
  const isOther = kept && sourceSelect.value === OTHER_SOURCE;
  sourceOther.hidden = !isOther;
  if (!isOther) sourceOther.value = '';
}

function updateRowNumbers() {
  const rows = [...rowsTbody.querySelectorAll('tr')];
  rows.forEach((tr, i) => {
    const rowNumber = i + 1;
    tr.querySelector('.row-number').textContent = String(rowNumber);
    tr.querySelectorAll('[data-label]').forEach((el) => {
      el.setAttribute('aria-label', `${el.dataset.label}, row ${rowNumber}`);
    });
  });
  document.querySelectorAll('.remove-row-btn').forEach((btn) => {
    btn.disabled = rows.length <= 1;
  });
}

function clearRowResult(tr) {
  const cell = tr.querySelector('.row-result');
  cell.innerHTML = '';
  tr.querySelectorAll('input, select').forEach((el) => el.removeAttribute('aria-invalid'));
}

function createRowElement() {
  rowIdCounter += 1;
  const tr = document.createElement('tr');
  tr.dataset.rowId = String(rowIdCounter);
  tr.innerHTML = `
    <th scope="row" class="row-number">1</th>
    <td><input type="text" class="row-pageUrl" data-label="Page URL" /></td>
    <td><input type="text" class="row-campaign" data-label="Campaign" list="campaign-suggestions" /></td>
    <td><select class="row-gaMedium" data-label="GA4 Medium"></select></td>
    <td><select class="row-campaignTerm" data-label="Campaign Term"></select></td>
    <td>
      <select class="row-source" data-label="Source"></select>
      <input type="text" class="row-source-other" data-label="New source" placeholder="Type new source" hidden />
    </td>
    <td><input type="text" class="row-campaignContent" data-label="Campaign Content" /></td>
    <td class="row-result"></td>
    <td><button type="button" class="btn btn-secondary btn-small remove-row-btn" data-label="Remove row">Remove</button></td>
  `;

  tr.querySelector('.row-gaMedium').addEventListener('change', () => {
    clearRowResult(tr);
    populateTermOptions(tr, '');
  });
  tr.querySelector('.row-campaignTerm').addEventListener('change', () => {
    clearRowResult(tr);
    populateSourceOptions(tr, '');
  });
  tr.querySelector('.row-source').addEventListener('change', (e) => {
    clearRowResult(tr);
    const sourceOther = tr.querySelector('.row-source-other');
    const isOther = e.target.value === OTHER_SOURCE;
    sourceOther.hidden = !isOther;
    if (isOther) sourceOther.focus();
    else sourceOther.value = '';
  });
  tr.querySelectorAll('.row-pageUrl, .row-campaign, .row-campaignContent, .row-source-other').forEach((el) => {
    el.addEventListener('input', () => clearRowResult(tr));
  });
  tr.querySelector('.remove-row-btn').addEventListener('click', () => {
    if (rowsTbody.querySelectorAll('tr').length <= 1) return;
    tr.remove();
    updateRowNumbers();
    announceRows('Row removed.');
  });

  populateMediumOptions(tr, '');
  return tr;
}

function addRow(prefill = {}) {
  const tr = createRowElement();
  rowsTbody.appendChild(tr);
  if (prefill.pageUrl) tr.querySelector('.row-pageUrl').value = prefill.pageUrl;
  updateRowNumbers();
  return tr;
}

function getRowData(tr) {
  const sourceSelect = tr.querySelector('.row-source');
  const sourceOther = tr.querySelector('.row-source-other');
  const source = sourceSelect.value === OTHER_SOURCE ? sourceOther.value.trim() : sourceSelect.value;
  return {
    pageUrl: tr.querySelector('.row-pageUrl').value.trim(),
    campaign: tr.querySelector('.row-campaign').value.trim(),
    gaMedium: tr.querySelector('.row-gaMedium').value,
    campaignTerm: tr.querySelector('.row-campaignTerm').value,
    source,
    campaignContent: tr.querySelector('.row-campaignContent').value.trim(),
  };
}

function writeRowResult(tr, result) {
  const cell = tr.querySelector('.row-result');
  if (result.errors.length > 0) {
    cell.innerHTML = `<span class="badge badge-error">Error</span><ul class="row-error-list">${result.errors
      .map((e) => `<li>${escapeHtml(e.message)}</li>`)
      .join('')}</ul>`;
    for (const err of result.errors) {
      const fieldEl = tr.querySelector(`.row-${err.field}`);
      if (fieldEl) fieldEl.setAttribute('aria-invalid', 'true');
    }
    return;
  }
  const badge = result.isDuplicate ? '<span class="badge badge-warn">Duplicate</span>' : '<span class="badge badge-valid">Valid</span>';
  const dupNote = result.isDuplicate ? `<p class="row-duplicate-note">${escapeHtml(result.duplicateReason)}</p>` : '';
  cell.innerHTML = `${badge}${dupNote}<code class="utm-output">${escapeHtml(result.utm)}</code><button type="button" class="btn btn-secondary btn-small copy-single" data-utm="${escapeHtml(result.utm)}">Copy</button>`;
  cell.querySelector('.copy-single').addEventListener('click', async (e) => {
    await navigator.clipboard.writeText(result.utm);
    e.target.textContent = 'Copied!';
    setTimeout(() => (e.target.textContent = 'Copy'), 1500);
  });
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

document.getElementById('fill-down-btn').addEventListener('click', () => {
  const rows = [...rowsTbody.querySelectorAll('tr')];
  if (rows.length < 2) return;
  const [first, ...rest] = rows;
  const source = getRowData(first);
  for (const tr of rest) {
    tr.querySelector('.row-campaign').value = source.campaign;
    tr.querySelector('.row-campaignContent').value = source.campaignContent;
    populateMediumOptions(tr, source.gaMedium);
    populateTermOptions(tr, source.campaignTerm);
    const sourceSelect = tr.querySelector('.row-source');
    const isKnownSource = [...sourceSelect.options].some((o) => o.value === source.source);
    if (isKnownSource) {
      populateSourceOptions(tr, source.source);
    } else if (source.source) {
      populateSourceOptions(tr, OTHER_SOURCE);
      tr.querySelector('.row-source-other').value = source.source;
    }
    clearRowResult(tr);
  }
  announceRows(`Copied row 1's Campaign, Medium, Term, Source and Content to ${rest.length} row(s).`);
});

paidOrganicSelect.addEventListener('change', () => {
  [...rowsTbody.querySelectorAll('tr')].forEach((tr) => {
    clearRowResult(tr);
    populateTermOptions(tr, tr.querySelector('.row-campaignTerm').value);
  });
});

document.getElementById('clear-btn').addEventListener('click', () => {
  form.reset();
  rowsTbody.innerHTML = '';
  addRow();
  resultsSection.hidden = true;
  lastResults = [];
  lastBatch = null;
  announce('Form cleared.');
});

function getBatch() {
  return {
    setUpBy: document.getElementById('setUpBy').value.trim(),
    date: document.getElementById('date').value,
    paidOrganic: paidOrganicSelect.value,
  };
}

function validateBatchFields(batch) {
  const errors = [];
  if (!batch.setUpBy) errors.push({ field: 'setUpBy', message: 'Set Up By is required.' });
  if (!batch.date) errors.push({ field: 'date', message: 'Date is required.' });
  if (!batch.paidOrganic) errors.push({ field: 'paidOrganic', message: 'Select Paid or Organic.' });
  return errors;
}

function clearBatchFieldErrors() {
  for (const key of ['setUpBy', 'date', 'paidOrganic']) {
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
  const validCount = results.length - errorCount;
  const parts = [`${results.length} row(s) generated`, `${validCount} valid`];
  if (errorCount > 0) parts.push(`${errorCount} with errors`);
  if (duplicateCount > 0) parts.push(`${duplicateCount} duplicate(s)`);
  return parts.join(', ') + '.';
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearBatchFieldErrors();
  resultsSection.hidden = true;

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

  const trs = [...rowsTbody.querySelectorAll('tr')];
  const rows = trs.map((tr) => getRowData(tr));
  const { results } = generateBatch(rows, batch, existing);

  trs.forEach((tr, i) => writeRowResult(tr, results[i]));

  lastResults = results;
  lastBatch = batch;

  resultsSummary.textContent = summarize(results);
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
  const headers = ['Row', 'Status', 'Set Up By', 'Date', 'Paid/Organic', 'Page URL', 'Campaign', 'GA4 Medium', 'Campaign Term', 'Source', 'Campaign Content', 'Generated UTM', 'Errors'];
  const rows = lastResults.map((r) => [
    r.index + 1,
    r.errors.length > 0 ? 'Error' : r.isDuplicate ? 'Duplicate' : 'Valid',
    lastBatch.setUpBy,
    lastBatch.date,
    lastBatch.paidOrganic,
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
    paidOrganic: lastBatch.paidOrganic,
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
    announce(`${records.length} UTM(s) added to the shared view.`);
  } catch (err) {
    closeConfirmDialog();
    announce(`Could not save to the shared view: ${err.message}`);
  }
});

addRow();
