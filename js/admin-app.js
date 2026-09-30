import { TERM_OPTIONS } from './rules.js';
import { escapeHtml } from './utils.js';

const API = '/admin/api/rules';
const ACCESS_API = '/admin/api/access';

const statusRegion = document.getElementById('admin-status-region');
const unauthorizedEl = document.getElementById('admin-unauthorized');
const contentEl = document.getElementById('admin-content');
const viewerEmailEl = document.getElementById('viewer-email');
const overridesListEl = document.getElementById('overrides-list');
const termSelect = document.getElementById('new-source-term');
const accessErrorEl = document.getElementById('admin-access-error');
const accessListEl = document.getElementById('admin-access-list');

let store = { campaigns: [], content: [], sources: [] };
let viewerEmail = '';
let admins = [];

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

function formatAdminMeta(admin) {
  if (!admin.addedBy) return 'Added directly in the Cloudflare dashboard';
  return `Added by ${escapeHtml(admin.addedBy)} on ${escapeHtml(new Date(admin.addedAt).toLocaleDateString('en-GB'))}`;
}

function renderAdminsList() {
  if (admins.length === 0) {
    accessListEl.innerHTML = '<p class="muted">No admins loaded.</p>';
    return;
  }
  const items = admins
    .map((admin) => {
      const isSelf = admin.email.toLowerCase() === viewerEmail.toLowerCase();
      const isLast = admins.length <= 1;
      const removeDisabled = isSelf || isLast;
      const removeTitle = isSelf ? "You can't remove your own admin access" : isLast ? "Can't remove the last remaining admin" : 'Remove';
      return `<li>
        <span>${escapeHtml(admin.email)}${isSelf ? ' <span class="muted">(you)</span>' : ''}</span>
        <span class="muted">${escapeHtml(admin.role)} · ${formatAdminMeta(admin)}</span>
        <button type="button" class="btn btn-secondary btn-small remove-admin-btn" data-email="${escapeHtml(admin.email)}" ${removeDisabled ? 'disabled' : ''} title="${escapeHtml(removeTitle)}">Remove</button>
      </li>`;
    })
    .join('');
  accessListEl.innerHTML = `<ul class="override-list">${items}</ul>`;

  accessListEl.querySelectorAll('.remove-admin-btn').forEach((btn) => {
    btn.addEventListener('click', () => removeAdmin(btn.dataset.email));
  });
}

function showAccessError(message) {
  accessErrorEl.hidden = !message;
  accessErrorEl.textContent = message || '';
}

async function fetchAdmins() {
  try {
    const res = await fetch(ACCESS_API);
    if (res.status === 501) {
      const body = await res.json().catch(() => ({}));
      showAccessError(body.error || 'Admin access management is not configured yet.');
      return;
    }
    if (!res.ok) throw new Error(`Request failed (${res.status}).`);
    const data = await res.json();
    admins = data.admins;
    showAccessError('');
    renderAdminsList();
  } catch (err) {
    showAccessError(`Could not load admin access: ${err.message}`);
  }
}

async function removeAdmin(email) {
  try {
    const res = await fetch(ACCESS_API, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || `Request failed (${res.status}).`);
    admins = body.admins;
    renderAdminsList();
    announce(`Removed ${email} from admin access.`);
  } catch (err) {
    announce(`Could not remove ${email}: ${err.message}`);
  }
}

document.getElementById('invite-admin-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const emailInput = document.getElementById('invite-email');
  const roleInput = document.getElementById('invite-role');
  const email = emailInput.value.trim();
  const role = roleInput.value.trim() || 'Admin';
  if (!email) return;
  try {
    const res = await fetch(ACCESS_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, role }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || `Request failed (${res.status}).`);
    admins = body.admins;
    renderAdminsList();
    emailInput.value = '';
    roleInput.value = 'Admin';
    announce(`Invited ${email} as ${role}.`);
  } catch (err) {
    announce(`Could not invite ${email}: ${err.message}`);
  }
});

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
    viewerEmail = data.viewerEmail;
    viewerEmailEl.textContent = data.viewerEmail;
    contentEl.hidden = false;
    renderOverridesList();
    await fetchAdmins();
  } catch (err) {
    unauthorizedEl.hidden = false;
    unauthorizedEl.querySelector('p').textContent = `Could not load admin data: ${err.message}`;
  }
}

init();
