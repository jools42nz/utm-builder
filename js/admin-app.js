import { TERM_OPTIONS } from './rules.js';
import { escapeHtml } from './utils.js';
import { listUsers, addUser, resetPassword, removeUser } from './usersStore.js';

const API = '/admin/api/rules';

const statusRegion = document.getElementById('admin-status-region');
const unauthorizedEl = document.getElementById('admin-unauthorized');
const contentEl = document.getElementById('admin-content');
const viewerEmailEl = document.getElementById('viewer-email');
const overridesListEl = document.getElementById('overrides-list');
const termSelect = document.getElementById('new-source-term');

const usersListEl = document.getElementById('users-list');
const usersBadgeEl = document.getElementById('users-badge');
const addUserForm = document.getElementById('add-user-form');
const addUserErrorEl = document.getElementById('add-user-error');

let store = { campaigns: [], content: [], sources: [] };

const AVATAR_COLORS = ['var(--purple)', 'var(--blue)', 'var(--orange)', 'var(--green)', '#8a8493'];

function announce(message) {
  statusRegion.textContent = message;
}

function initials(username) {
  const parts = username.split(/[._-]/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[1][0] : username.slice(0, 2);
  return letters.toUpperCase();
}

function avatarColor(username) {
  let hash = 0;
  for (const ch of username) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
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
      const count = entries.length;
      if (count === 0) {
        return `<div class="override-section"><div class="override-section-title">${title} · 0</div><p class="muted">None added yet.</p></div>`;
      }
      const rows = entries
        .map(
          (entry) => `<div class="override-row">
            <div>
              <span class="list-row-name">${escapeHtml(entry.value)}</span>
              ${entry.term ? `<span class="muted"> under Term "${escapeHtml(entry.term)}"</span>` : ''}
              <span class="muted"> · Added by ${formatEntry(entry)}</span>
            </div>
            <button type="button" class="btn-icon btn-icon-danger remove-override-btn" data-kind="${kind}" data-value="${escapeHtml(entry.value)}" data-term="${escapeHtml(entry.term || '')}" aria-label="Remove ${escapeHtml(entry.value)}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
            </button>
          </div>`
        )
        .join('');
      return `<div class="override-section"><div class="override-section-title">${title} · ${count}</div>${rows}</div>`;
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

// ---- Manage users (local mock — see js/usersStore.js) ----

function renderUsersList() {
  const users = listUsers();
  const adminCount = users.filter((u) => u.role === 'admin').length;
  usersBadgeEl.textContent = `${users.length} account${users.length === 1 ? '' : 's'} · ${adminCount} admin${adminCount === 1 ? '' : 's'}`;

  if (users.length === 0) {
    usersListEl.innerHTML = '<p class="muted" style="padding: 16px">No users added yet — add the first one below.</p>';
    return;
  }

  const sorted = [...users].sort((a, b) => a.username.localeCompare(b.username));
  usersListEl.innerHTML = sorted
    .map((user) => {
      const isLastAdmin = user.role === 'admin' && adminCount <= 1;
      return `<div class="list-row">
        <div class="list-row-main">
          <div class="avatar" style="background: ${avatarColor(user.username)}">${escapeHtml(initials(user.username))}</div>
          <div>
            <div class="list-row-name">${escapeHtml(user.username)}</div>
            <div class="list-row-meta">Added ${escapeHtml(new Date(user.addedAt).toLocaleDateString('en-GB'))}</div>
          </div>
        </div>
        <div class="list-row-end">
          <span class="pill ${user.role === 'admin' ? 'pill-role-admin' : 'pill-role-user'}">${user.role === 'admin' ? 'Admin' : 'User'}</span>
          <button type="button" class="btn-icon reset-password-btn" data-username="${escapeHtml(user.username)}" aria-label="Reset password for ${escapeHtml(user.username)}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="15" r="4"/><line x1="10.5" y1="12.5" x2="19" y2="4"/><line x1="15" y1="9" x2="18" y2="12"/></svg>
          </button>
          <button type="button" class="btn-icon btn-icon-danger remove-user-btn" data-username="${escapeHtml(user.username)}" ${isLastAdmin ? 'disabled' : ''} title="${isLastAdmin ? "Can't remove the last remaining admin" : 'Remove'}" aria-label="Remove ${escapeHtml(user.username)}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
          </button>
        </div>
      </div>`;
    })
    .join('');

  usersListEl.querySelectorAll('.reset-password-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const username = btn.dataset.username;
      const password = window.prompt(`New password for ${username} (at least 8 characters):`);
      if (password === null) return;
      try {
        resetPassword(username, password);
        announce(`Password updated for ${username}.`);
      } catch (err) {
        announce(`Could not update password: ${err.message}`);
      }
    });
  });

  usersListEl.querySelectorAll('.remove-user-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const username = btn.dataset.username;
      if (!window.confirm(`Remove ${username}? This can't be undone.`)) return;
      try {
        removeUser(username);
        renderUsersList();
        announce(`Removed ${username}.`);
      } catch (err) {
        announce(`Could not remove ${username}: ${err.message}`);
      }
    });
  });
}

addUserForm.addEventListener('submit', (event) => {
  event.preventDefault();
  addUserErrorEl.hidden = true;
  const username = document.getElementById('new-username').value;
  const password = document.getElementById('new-password').value;
  const role = document.getElementById('new-role').value;
  try {
    addUser({ username, password, role });
    addUserForm.reset();
    renderUsersList();
    announce(`Added ${username.trim()} as ${role === 'admin' ? 'Admin' : 'User'}.`);
  } catch (err) {
    addUserErrorEl.hidden = false;
    addUserErrorEl.textContent = err.message;
  }
});

// ---- Add Campaign / Source / Campaign Content ----

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
  renderUsersList();

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
