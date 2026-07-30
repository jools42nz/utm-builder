import { dataAccess } from './dataAccess.js';
import { escapeHtml, rowsToCsv, downloadFile } from './utils.js';

const searchInput = document.getElementById('search');
const setUpByInput = document.getElementById('filter-setUpBy');
const campaignInput = document.getElementById('filter-campaign');
const dateInput = document.getElementById('filter-date');
const paidOrganicSelect = document.getElementById('filter-paidOrganic');
const tableContainer = document.getElementById('shared-table-container');
const summary = document.getElementById('shared-summary');
const statusRegion = document.getElementById('shared-status-region');

let allRecords = [];

function announce(message) {
  statusRegion.textContent = message;
}

function matchesFilters(record) {
  const search = searchInput.value.trim().toLowerCase();
  if (search) {
    const haystack = Object.values(record).join(' ').toLowerCase();
    if (!haystack.includes(search)) return false;
  }
  const setUpBy = setUpByInput.value.trim().toLowerCase();
  if (setUpBy && !record.setUpBy.toLowerCase().includes(setUpBy)) return false;

  const campaign = campaignInput.value.trim().toLowerCase();
  if (campaign && !record.campaign.toLowerCase().includes(campaign)) return false;

  if (dateInput.value && record.date !== dateInput.value) return false;

  if (paidOrganicSelect.value && record.paidOrganic !== paidOrganicSelect.value) return false;

  return true;
}

function render() {
  const filtered = allRecords.filter(matchesFilters);
  summary.textContent = `Showing ${filtered.length} of ${allRecords.length} UTM(s).`;

  if (filtered.length === 0) {
    tableContainer.innerHTML = '<p>No UTMs match the current filters.</p>';
    return;
  }

  const sorted = [...filtered].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

  const rowsHtml = sorted
    .map(
      (r) => `<tr>
        <td>${escapeHtml(r.setUpBy)}</td>
        <td>${escapeHtml(r.date)}</td>
        <td>${escapeHtml(r.paidOrganic)}</td>
        <td>${escapeHtml(r.campaign)}</td>
        <td>${escapeHtml(r.gaMedium)}</td>
        <td>${escapeHtml(r.campaignTerm)}</td>
        <td>${escapeHtml(r.source)}</td>
        <td><code class="utm-output">${escapeHtml(r.utm)}</code>
          <button type="button" class="btn btn-secondary btn-small copy-single" data-utm="${escapeHtml(r.utm)}">Copy</button>
        </td>
      </tr>`
    )
    .join('');

  tableContainer.innerHTML = `<table class="results-table">
    <caption class="visually-hidden">Shared UTM view, filtered by the criteria above</caption>
    <thead>
      <tr>
        <th scope="col">Set Up By</th>
        <th scope="col">Date</th>
        <th scope="col">Paid/Organic</th>
        <th scope="col">Campaign</th>
        <th scope="col">GA4 Medium</th>
        <th scope="col">Campaign Term</th>
        <th scope="col">Source</th>
        <th scope="col">UTM</th>
      </tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
  </table>`;

  tableContainer.querySelectorAll('.copy-single').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await navigator.clipboard.writeText(btn.dataset.utm);
      btn.textContent = 'Copied!';
      setTimeout(() => (btn.textContent = 'Copy'), 1500);
    });
  });
}

async function load() {
  try {
    allRecords = await dataAccess.list();
    render();
  } catch (err) {
    tableContainer.innerHTML = `<p role="alert">Could not load the shared view: ${escapeHtml(err.message)}</p>`;
  }
}

[searchInput, setUpByInput, campaignInput, dateInput, paidOrganicSelect].forEach((el) => {
  el.addEventListener('input', render);
  el.addEventListener('change', render);
});

document.getElementById('clear-filters-btn').addEventListener('click', () => {
  searchInput.value = '';
  setUpByInput.value = '';
  campaignInput.value = '';
  dateInput.value = '';
  paidOrganicSelect.value = '';
  render();
  announce('Filters cleared.');
});

document.getElementById('export-shared-csv-btn').addEventListener('click', () => {
  const filtered = allRecords.filter(matchesFilters);
  const headers = ['Set Up By', 'Date', 'Paid/Organic', 'Page URL', 'Campaign', 'GA4 Medium', 'Campaign Term', 'Source', 'Campaign Content', 'UTM', 'Created At'];
  const rows = filtered.map((r) => [r.setUpBy, r.date, r.paidOrganic, r.pageUrl, r.campaign, r.gaMedium, r.campaignTerm, r.source, r.campaignContent, r.utm, r.createdAt]);
  downloadFile('utm-shared-view.csv', rowsToCsv(headers, rows));
});

load();
