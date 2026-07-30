import { generateBatch, FIELD_KEYS } from './generator.js';
import { clearFieldErrors, renderFieldErrors, renderRowErrorsIntoFields, renderResultsTable, validUtmsFrom, copyAllValid, exportResultsCsv } from './report.js';
import { dataAccess } from './dataAccess.js';
import { generateId } from './utils.js';

const form = document.getElementById('builder-form');
const resultsSection = document.getElementById('results-section');
const resultsSummary = document.getElementById('results-summary');
const resultsTableContainer = document.getElementById('results-table-container');
const statusRegion = document.getElementById('status-region');
const confirmOpenBtn = document.getElementById('confirm-open-btn');
const confirmDialog = document.getElementById('confirm-dialog');
const confirmYesBtn = document.getElementById('confirm-yes-btn');
const confirmCancelBtn = document.getElementById('confirm-cancel-btn');

let lastResults = [];
let lastBatch = null;
let openerBeforeDialog = null;

function announce(message) {
  statusRegion.textContent = message;
}

function getBatch() {
  return {
    setUpBy: document.getElementById('setUpBy').value.trim(),
    date: document.getElementById('date').value,
    paidOrganic: document.getElementById('paidOrganic').value,
  };
}

function getRawFields() {
  const fields = {};
  for (const key of FIELD_KEYS) {
    fields[key] = document.getElementById(key).value;
  }
  return fields;
}

function validateBatchFields(batch) {
  const errors = [];
  if (!batch.setUpBy) errors.push({ field: 'setUpBy', message: 'Set Up By is required.' });
  if (!batch.date) errors.push({ field: 'date', message: 'Date is required.' });
  if (!batch.paidOrganic) errors.push({ field: 'paidOrganic', message: 'Select Paid or Organic.' });
  return errors;
}

function summarize(results, blankLinesDropped) {
  const errorCount = results.filter((r) => r.errors.length > 0).length;
  const duplicateCount = results.filter((r) => r.errors.length === 0 && r.isDuplicate).length;
  const validCount = results.length - errorCount;
  const droppedTotal = Object.values(blankLinesDropped).reduce((a, b) => a + b, 0);

  const parts = [`${results.length} row(s) generated`, `${validCount} valid`];
  if (errorCount > 0) parts.push(`${errorCount} with errors`);
  if (duplicateCount > 0) parts.push(`${duplicateCount} duplicate(s)`);
  if (droppedTotal > 0) parts.push(`${droppedTotal} blank line(s) ignored`);
  return parts.join(', ') + '.';
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearFieldErrors();
  resultsSection.hidden = true;

  const batch = getBatch();
  const batchErrors = validateBatchFields(batch);
  if (batchErrors.length > 0) {
    renderFieldErrors(batchErrors);
    announce('The form has errors. Please review the highlighted fields.');
    document.getElementById(batchErrors[0].field).focus();
    return;
  }

  let existing = [];
  try {
    existing = (await dataAccess.list()).map((r) => r.utm);
  } catch (err) {
    // Shared view lookup is best-effort for duplicate-checking; generation still proceeds.
    console.warn('Could not load shared view for duplicate check:', err);
  }

  const rawFields = getRawFields();
  const batchResult = generateBatch(rawFields, batch, existing);

  if (!batchResult.ok) {
    renderFieldErrors(batchResult.formErrors);
    announce('The form has errors. Please review the highlighted fields.');
    return;
  }

  renderRowErrorsIntoFields(batchResult.results);

  lastResults = batchResult.results;
  lastBatch = batch;

  resultsSummary.textContent = summarize(batchResult.results, batchResult.blankLinesDropped);
  renderResultsTable(resultsTableContainer, batchResult.results);
  resultsSection.hidden = false;
  confirmOpenBtn.disabled = validUtmsFrom(batchResult.results).length === 0;
  announce(resultsSummary.textContent);
  resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

document.getElementById('clear-btn').addEventListener('click', () => {
  form.reset();
  clearFieldErrors();
  resultsSection.hidden = true;
  lastResults = [];
  lastBatch = null;
  announce('Form cleared.');
});

document.getElementById('copy-all-btn').addEventListener('click', async () => {
  const count = await copyAllValid(lastResults);
  announce(`${count} UTM(s) copied to clipboard.`);
});

document.getElementById('export-csv-btn').addEventListener('click', () => {
  exportResultsCsv(lastResults, lastBatch);
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
    const nextIndex = event.shiftKey
      ? (currentIndex - 1 + focusable.length) % focusable.length
      : (currentIndex + 1) % focusable.length;
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
