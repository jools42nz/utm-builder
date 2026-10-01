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
const activeFiltersEl = document.getElementById('active-filters');

const textFilters = [setUpByInput, pageUrlInput, campaignInput, sourceInput, campaignContentInput];
const allFilterEls = [searchInput, ...textFilters, dateInput, gaMediumSelect, campaignTermSelect];
const FILTER_LABELS = {
  search: 'Search',
  'filter-setUpBy': 'Set Up By',
  'filter-date': 'Date',
  'filter-pageUrl': 'Page URL',
  'filter-campaign': 'Campaign',
  'filter-gaMedium': 'GA4 Medium',
  'filter-campaignTerm': 'Campaign Term',
  'filter-source': 'Source',
  'filter-campaignContent': 'Campaign Content',
};

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

const ICON_COPY = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 01-1-1V4a1 1 0 011-1h10a1 1 0 011 1v1"/></svg>';
const ICON_COPIED = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
const ICON_REMOVE_CHIP = '<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';

let lastActiveFiltersKey = null;

function renderActiveFilters() {
  const active = allFilterEls.filter((el) => el.value);
  // Clicking a chip blurs whichever filter field is currently focused, which
  // fires a redundant 'change' on it (its value hasn't actually changed
  // since the last 'input') right between the click's mousedown and mouseup.
  // Rebuilding the chip DOM there would detach the very node being clicked,
  // and the browser drops the click entirely. Skipping the rebuild when the
  // active-filter set hasn't changed keeps that node alive for the click.
  const key = active.map((el) => `${el.id}=${el.value}`).join('|');
  if (key === lastActiveFiltersKey) return;
  lastActiveFiltersKey = key;

  const chips = active.map((el) => {
    const label = FILTER_LABELS[el.id] || el.id;
    const value = el.tagName === 'SELECT' ? el.options[el.selectedIndex].textContent : el.value;
    return `<button type="button" class="chip" data-clear="${el.id}">${escapeHtml(label)}: ${escapeHtml(value)} ${ICON_REMOVE_CHIP}</button>`;
  });

  if (chips.length === 0) {
    activeFiltersEl.innerHTML = '';
    return;
  }

  activeFiltersEl.innerHTML = `<span class="active-filters-label">Active filters:</span>${chips.join('')}`;
  activeFiltersEl.querySelectorAll('.chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const el = document.getElementById(chip.dataset.clear);
      el.value = '';
      render();
    });
  });
}

function render() {
  const filtered = allRecords.filter(matchesFilters);
  summary.textContent = `Showing ${filtered.length} of ${allRecords.length} UTM(s).`;
  renderActiveFilters();

  if (filtered.length === 0) {
    tableContainer.innerHTML = '<p style="padding: 24px">No UTMs match the current filters.</p>';
    return;
  }

  const sorted = [...filtered].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

  const rowsHtml = sorted
    .map(
      (r) => `<tr>
        <td data-label="Set Up By">${escapeHtml(r.setUpBy)}</td>
        <td data-label="Date">${escapeHtml(r.date)}</td>
        <td class="cell-url" data-label="Page URL">${escapeHtml(r.pageUrl)}</td>
        <td data-label="Campaign">${escapeHtml(r.campaign)}</td>
        <td data-label="GA4 Medium">${escapeHtml(r.gaMedium)}</td>
        <td data-label="Campaign Term">${escapeHtml(r.campaignTerm)}</td>
        <td data-label="Source">${escapeHtml(r.source)}</td>
        <td data-label="Campaign Content">${escapeHtml(r.campaignContent)}</td>
        <td class="cell-utm" data-label="UTM"><code class="utm-output">${escapeHtml(r.utm)}</code>
          <button type="button" class="btn-icon copy-single" data-utm="${escapeHtml(r.utm)}" aria-label="Copy UTM">${ICON_COPY}</button>
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
      btn.innerHTML = ICON_COPIED;
      btn.setAttribute('aria-label', 'Copied');
      setTimeout(() => {
        btn.innerHTML = ICON_COPY;
        btn.setAttribute('aria-label', 'Copy UTM');
      }, 1500);
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
