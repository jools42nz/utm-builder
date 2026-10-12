import { MEDIUM_OPTIONS, TERM_OPTIONS } from './rules.js';
import { dataAccess } from './dataAccess.js';
import { escapeHtml, rowsToCsv, downloadFile, formatDateUK } from './utils.js';

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
let isAdmin = false;

function announce(message) {
  statusRegion.textContent = message;
}

const ICON_DELETE = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>';

async function checkIsAdmin() {
  try {
    const res = await fetch('/api/whoami');
    if (!res.ok) return false;
    const session = await res.json();
    return session.role === 'admin';
  } catch {
    return false;
  }
}

async function deleteRecord(record) {
  if (!confirm(`Remove this UTM from the shared view?\n\n${record.pageUrl}\n\nThis can't be undone.`)) return;
  try {
    const res = await fetch('/admin/api/utms', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: record.id }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || `Request failed (${res.status}).`);
    allRecords = allRecords.filter((r) => r.id !== record.id);
    render();
    announce(`Removed the UTM for ${record.pageUrl}.`);
  } catch (err) {
    announce(`Could not remove UTM: ${err.message}`);
  }
}

// One-time recovery path for UTMs saved before the shared view was wired up
// to the real backend (dataAccess.js's BACKEND was 'mock' — see that file):
// those records only ever existed in that person's own browser's
// localStorage. Offers to upload whatever's still sitting there into the
// real shared store.
const LEGACY_STORAGE_KEY = 'utm-builder:records';
const legacyBanner = document.getElementById('legacy-import-banner');
const legacyCountEl = document.getElementById('legacy-import-count');
const legacyImportBtn = document.getElementById('legacy-import-btn');
const legacyDismissBtn = document.getElementById('legacy-import-dismiss-btn');

function checkForLegacyLocalData() {
  let legacyRecords;
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    legacyRecords = raw ? JSON.parse(raw) : [];
  } catch {
    legacyRecords = [];
  }
  if (!Array.isArray(legacyRecords) || legacyRecords.length === 0) return;

  legacyCountEl.textContent = legacyRecords.length;
  legacyBanner.hidden = false;

  legacyImportBtn.addEventListener('click', async () => {
    legacyImportBtn.disabled = true;
    try {
      allRecords = await dataAccess.append(legacyRecords);
      localStorage.removeItem(LEGACY_STORAGE_KEY);
      legacyBanner.hidden = true;
      render();
      announce(`Uploaded ${legacyRecords.length} UTM(s) from this browser to the shared view.`);
    } catch (err) {
      legacyImportBtn.disabled = false;
      announce(`Could not upload: ${err.message}`);
    }
  });

  legacyDismissBtn.addEventListener('click', () => {
    legacyBanner.hidden = true;
  });
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
const ICON_CHEVRON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';

// Which cards are expanded — kept outside render() since render() rebuilds
// the whole list from scratch on every filter keystroke; without this,
// expanding a card would collapse again the next time you typed.
const expandedIds = new Set();

function truncateUtm(utm) {
  return utm.length > 60 ? `${utm.slice(0, 57)}…` : utm;
}

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
    const value = el.tagName === 'SELECT' ? el.options[el.selectedIndex].textContent : el.id === 'filter-date' ? formatDateUK(el.value) : el.value;
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

  const cardsHtml = sorted
    .map((r) => {
      const isExpanded = expandedIds.has(r.id);
      const id = escapeHtml(r.id);
      return `<div class="row-card" data-id="${id}">
        <div class="row-header">
          <button type="button" class="row-toggle" aria-expanded="${isExpanded}" aria-controls="shared-details-${id}" aria-label="${isExpanded ? 'Collapse' : 'Expand'} details for ${escapeHtml(r.pageUrl)}" data-id="${id}">${ICON_CHEVRON}</button>
          <div class="shared-row-main">
            <div class="shared-row-pageUrl">${escapeHtml(r.pageUrl)}</div>
            <div class="shared-row-meta">${escapeHtml(r.setUpBy)} &middot; ${escapeHtml(formatDateUK(r.date))}</div>
          </div>
          <code class="shared-row-utm-preview">${escapeHtml(truncateUtm(r.utm))}</code>
          <div class="row-actions">
            <button type="button" class="btn-icon copy-single" data-utm="${escapeHtml(r.utm)}" aria-label="Copy UTM">${ICON_COPY}</button>
            ${isAdmin ? `<button type="button" class="btn-icon btn-icon-danger delete-utm-btn" data-id="${id}" title="Remove from shared view" aria-label="Remove from shared view">${ICON_DELETE}</button>` : ''}
          </div>
        </div>
        <div class="row-details" id="shared-details-${id}" ${isExpanded ? '' : 'hidden'}>
          <div class="shared-fields-grid">
            <div><span class="shared-field-label">Campaign</span><span class="shared-field-value">${escapeHtml(r.campaign)}</span></div>
            <div><span class="shared-field-label">GA4 Medium</span><span class="shared-field-value">${escapeHtml(r.gaMedium)}</span></div>
            <div><span class="shared-field-label">Campaign Term</span><span class="shared-field-value">${escapeHtml(r.campaignTerm)}</span></div>
            <div><span class="shared-field-label">Source</span><span class="shared-field-value">${escapeHtml(r.source)}</span></div>
            <div><span class="shared-field-label">Campaign Content</span><span class="shared-field-value">${escapeHtml(r.campaignContent)}</span></div>
          </div>
          <div class="row-utm-output"><code class="utm-output">${escapeHtml(r.utm)}</code></div>
        </div>
      </div>`;
    })
    .join('');

  tableContainer.innerHTML = `<div class="rows-list">${cardsHtml}</div>`;

  tableContainer.querySelectorAll('.row-toggle').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      if (expandedIds.has(id)) expandedIds.delete(id);
      else expandedIds.add(id);
      render();
    });
  });

  if (isAdmin) {
    tableContainer.querySelectorAll('.delete-utm-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const record = allRecords.find((r) => r.id === btn.dataset.id);
        if (record) deleteRecord(record);
      });
    });
  }

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
  isAdmin = await checkIsAdmin();
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
checkForLegacyLocalData();
