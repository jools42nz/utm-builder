import { MEDIUM_OPTIONS, TERM_OPTIONS } from './rules.js';
import { dataAccess } from './dataAccess.js';
import { escapeHtml, rowsToCsv, downloadFile } from './utils.js';

const searchInput = document.getElementById('search');
const setUpByInput = document.getElementById('filter-setUpBy');
const dateInput = document.getElementById('filter-date');
const pageUrlInput = document.getElementById('filter-pageUrl');
const campaignInput = document.getElementById('filter-campaign');
const gaMediumSelect = document.getElementById('filter-gaMedium');
const campaignTermSelect = document.getElementById('filter-campaignTerm');
const sourceInput = document.getElementById('filter-source');
const campaignContentInput = document.getElementById('filter-campaignContent');
const tableContainer = document.getElementById('shared-table-container');
const summary = document.getElementById('shared-summary');
const statusRegion = document.getElementById('shared-status-region');

const textFilters = [setUpByInput, pageUrlInput, campaignInput, sourceInput, campaignContentInput];
const allFilterEls = [searchInput, ...textFilters, dateInput, gaMediumSelect, campaignTermSelect];

let allRecords = [];

function announce(message) {
  statusRegion.textContent = message;
}

gaMediumSelect.innerHTML += MEDIUM_OPTIONS.map((m) => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join('');
campaignTermSelect.innerHTML += TERM_OPTIONS.map((t) => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join('');

function matchesFilters(record) {
  const search = searchInput.value.trim().toLowerCase();
  if (search) {
    const haystack = Object.values(record).join(' ').toLowerCase();
    if (!haystack.includes(search)) return false;
  }

  if (dateInput.value && record.date !== dateInput.value) return false;
  if (gaMediumSelect.value && record.gaMedium !== gaMediumSelect.value) return false;
  if (campaignTermSelect.value && record.campaignTerm !== campaignTermSelect.value) return false;

  const setUpBy = setUpByInput.value.trim().toLowerCase();
  if (setUpBy && !record.setUpBy.toLowerCase().includes(setUpBy)) return false;

  const pageUrl = pageUrlInput.value.trim().toLowerCase();
  if (pageUrl && !record.pageUrl.toLowerCase().includes(pageUrl)) return false;

  const campaign = campaignInput.value.trim().toLowerCase();
  if (campaign && !record.campaign.toLowerCase().includes(campaign)) return false;

  const source = sourceInput.value.trim().toLowerCase();
  if (source && !record.source.toLowerCase().includes(source)) return false;

  const campaignContent = campaignContentInput.value.trim().toLowerCase();
  if (campaignContent && !record.campaignContent.toLowerCase().includes(campaignContent)) return false;

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
        <td class="cell-url">${escapeHtml(r.pageUrl)}</td>
        <td>${escapeHtml(r.campaign)}</td>
        <td>${escapeHtml(r.gaMedium)}</td>
        <td>${escapeHtml(r.campaignTerm)}</td>
        <td>${escapeHtml(r.source)}</td>
        <td>${escapeHtml(r.campaignContent)}</td>
        <td class="cell-utm"><code class="utm-output">${escapeHtml(r.utm)}</code>
          <button type="button" class="btn btn-secondary btn-small copy-single" data-utm="${escapeHtml(r.utm)}">Copy</button>
        </td>
      </tr>`
    )
    .join('');

  tableContainer.innerHTML = `<table class="results-table results-table-wide">
    <caption class="visually-hidden">Shared UTM view, filtered by the criteria above</caption>
    <thead>
      <tr>
        <th scope="col">Set Up By</th>
        <th scope="col">Date</th>
        <th scope="col">Page URL</th>
        <th scope="col">Campaign</th>
        <th scope="col">GA4 Medium</th>
        <th scope="col">Campaign Term</th>
        <th scope="col">Source</th>
        <th scope="col">Campaign Content</th>
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

allFilterEls.forEach((el) => {
  el.addEventListener('input', render);
  el.addEventListener('change', render);
});

document.getElementById('clear-filters-btn').addEventListener('click', () => {
  allFilterEls.forEach((el) => (el.value = ''));
  render();
  announce('Filters cleared.');
});

document.getElementById('export-shared-csv-btn').addEventListener('click', () => {
  const filtered = allRecords.filter(matchesFilters);
  const headers = ['Set Up By', 'Date', 'Page URL', 'Campaign', 'GA4 Medium', 'Campaign Term', 'Source', 'Campaign Content', 'UTM', 'Created At'];
  const rows = filtered.map((r) => [r.setUpBy, r.date, r.pageUrl, r.campaign, r.gaMedium, r.campaignTerm, r.source, r.campaignContent, r.utm, r.createdAt]);
  downloadFile('utm-shared-view.csv', rowsToCsv(headers, rows));
});

load();
