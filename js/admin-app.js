import { TERM_OPTIONS } from './rules.js';
import { escapeHtml } from './utils.js';

const API = '/admin/api/rules';

const statusRegion = document.getElementById('admin-status-region');
const unauthorizedEl = document.getElementById('admin-unauthorized');
const contentEl = document.getElementById('admin-content');
const viewerEmailEl = document.getElementById('viewer-email');
const overridesListEl = document.getElementById('overrides-list');
const termSelect = document.getElementById('new-source-term');

let store = { campaigns: [], content: [], sources: [] };

function announce(message) {
  statusRegion.textContent = message;
}

function formatEntry(entry) {
  return `${escapeHtml(entry.addedBy)} on ${escapeHtml(new Date(entry.addedAt).toLocaleDateString('en-GB'))}`;
}

function renderOverridesList() {
  const sections = [
    { title: 'Campaigns', kind: 'campaign', entries: store.campaigns },
    { title: 'Campaign Content', kind: 'content', entries: store.content },
    { title: 'Sources', kind: 'source', entries: store.sources },
  ];

  overridesListEl.innerHTML = sections
    .map(({ title, kind, entries }) => {
      if (entries.length === 0) return `<h3>${title}</h3><p class="muted">None added yet.</p>`;
      const items = entries
        .map(
          (entry) => `<li>
            <span>${escapeHtml(entry.value)}${entry.term ? ` <span class="muted">(under Term "${escapeHtml(entry.term)}")</span>` : ''}</span>
            <span class="muted">Added by ${formatEntry(entry)}</span>
            <button type="button" class="btn btn-secondary btn-small remove-override-btn" data-kind="${kind}" data-value="${escapeHtml(entry.value)}" data-term="${escapeHtml(entry.term || '')}">Remove</button>
          </li>`
        )
        .join('');
      return `<h3>${title}</h3><ul class="override-list">${items}</ul>`;
    })
    .join('');

  overridesListEl.querySelectorAll('.remove-override-btn').forEach((btn) => {
    btn.addEventListener('click', () => removeOverride(btn.dataset.kind, btn.dataset.value, btn.dataset.term || undefined));
  });
}

async function removeOverride(kind, value, term) {
  try {
    const res = await fetch(API, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, value, term }),
    });
    if (!res.ok) throw new Error(`Request failed (${res.status}).`);
    store = await res.json();
    renderOverridesList();
    announce(`Removed "${value}".`);
  } catch (err) {
    announce(`Could not remove "${value}": ${err.message}`);
  }
}

async function addOverride(kind, value, term) {
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind, value, term }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${res.status}).`);
  }
  store = await res.json();
  renderOverridesList();
}

termSelect.innerHTML = TERM_OPTIONS.map((t) => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join('');

document.getElementById('add-campaign-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const input = document.getElementById('new-campaign-value');
  const value = input.value.trim();
  if (!value) return;
  try {
    await addOverride('campaign', value);
    input.value = '';
    announce(`Added Campaign "${value}".`);
  } catch (err) {
    announce(`Could not add Campaign: ${err.message}`);
  }
});

document.getElementById('add-source-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const input = document.getElementById('new-source-value');
  const value = input.value.trim();
  const term = termSelect.value;
  if (!value) return;
  try {
    await addOverride('source', value, term);
    input.value = '';
    announce(`Added Source "${value}" under Term "${term}".`);
  } catch (err) {
    announce(`Could not add Source: ${err.message}`);
  }
});

document.getElementById('add-content-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const input = document.getElementById('new-content-value');
  const value = input.value.trim();
  if (!value) return;
  try {
    await addOverride('content', value);
    input.value = '';
    announce(`Added Campaign Content "${value}".`);
  } catch (err) {
    announce(`Could not add Campaign Content: ${err.message}`);
  }
});

async function init() {
  try {
    const res = await fetch(API);
    if (res.status === 401) {
      unauthorizedEl.hidden = false;
      return;
    }
    if (!res.ok) throw new Error(`Request failed (${res.status}).`);
    const data = await res.json();
    store = { campaigns: data.campaigns, content: data.content, sources: data.sources };
    viewerEmailEl.textContent = data.viewerEmail;
    contentEl.hidden = false;
    renderOverridesList();
  } catch (err) {
    unauthorizedEl.hidden = false;
    unauthorizedEl.querySelector('p').textContent = `Could not load admin data: ${err.message}`;
  }
}

init();
