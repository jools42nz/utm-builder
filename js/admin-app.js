import { TERM_OPTIONS } from './rules.js';
import { escapeHtml } from './utils.js';

const RULES_API = '/admin/api/rules';
const USERS_API = '/admin/api/users';

const statusRegion = document.getElementById('admin-status-region');
const unauthorizedEl = document.getElementById('admin-unauthorized');
const contentEl = document.getElementById('admin-content');
const viewerUsernameEl = document.getElementById('viewer-username');
const overridesListEl = document.getElementById('overrides-list');
const termSelect = document.getElementById('new-source-term');
const usersErrorEl = document.getElementById('users-error');
const usersListEl = document.getElementById('users-list');

let store = { campaigns: [], content: [], sources: [] };
let viewerUsername = '';
let users = [];

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
    const res = await fetch(RULES_API, {
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
  const res = await fetch(RULES_API, {
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

// ---- Manage users ----

function showUsersError(message) {
  usersErrorEl.hidden = !message;
  usersErrorEl.textContent = message || '';
}

function renderUsersList() {
  if (users.length === 0) {
    usersListEl.innerHTML = '<p class="muted">No users loaded.</p>';
    return;
  }
  const items = users
    .map((user) => {
      const isSelf = user.username.toLowerCase() === viewerUsername.toLowerCase();
      const remainingAdmins = users.filter((u) => u.role === 'admin' && u.username.toLowerCase() !== user.username.toLowerCase());
      const isLastAdmin = user.role === 'admin' && remainingAdmins.length === 0;
      const removeDisabled = isSelf || isLastAdmin;
      const removeTitle = isSelf ? "You can't remove your own account" : isLastAdmin ? "Can't remove the last remaining admin" : 'Remove';
      const added = user.addedBy ? `Added by ${escapeHtml(user.addedBy)} on ${escapeHtml(new Date(user.addedAt).toLocaleDateString('en-GB'))}` : 'Added directly';
      return `<li>
        <span>${escapeHtml(user.username)}${isSelf ? ' <span class="muted">(you)</span>' : ''}</span>
        <span class="muted">${escapeHtml(user.role)} · ${added}</span>
        <button type="button" class="btn btn-secondary btn-small reset-password-btn" data-username="${escapeHtml(user.username)}">Reset password</button>
        <button type="button" class="btn btn-secondary btn-small remove-user-btn" data-username="${escapeHtml(user.username)}" ${removeDisabled ? 'disabled' : ''} title="${escapeHtml(removeTitle)}">Remove</button>
      </li>`;
    })
    .join('');
  usersListEl.innerHTML = `<ul class="override-list">${items}</ul>`;

  usersListEl.querySelectorAll('.remove-user-btn').forEach((btn) => {
    btn.addEventListener('click', () => removeUser(btn.dataset.username));
  });
  usersListEl.querySelectorAll('.reset-password-btn').forEach((btn) => {
    btn.addEventListener('click', () => resetPassword(btn.dataset.username));
  });
}

async function fetchUsers() {
  try {
    const res = await fetch(USERS_API);
    if (!res.ok) throw new Error(`Request failed (${res.status}).`);
    const data = await res.json();
    users = data.users;
    showUsersError('');
    renderUsersList();
  } catch (err) {
    showUsersError(`Could not load users: ${err.message}`);
  }
}

async function removeUser(username) {
  if (!window.confirm(`Remove "${username}"? They'll be signed out next time they try to use the tool.`)) return;
  try {
    const res = await fetch(USERS_API, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || `Request failed (${res.status}).`);
    users = body.users;
    renderUsersList();
    announce(`Removed ${username}.`);
  } catch (err) {
    announce(`Could not remove ${username}: ${err.message}`);
  }
}

async function resetPassword(username) {
  const newPassword = window.prompt(`New password for "${username}" (at least 8 characters):`);
  if (!newPassword) return;
  try {
    const res = await fetch(USERS_API, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, newPassword }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || `Request failed (${res.status}).`);
    announce(`Password reset for ${username}. Share the new password with them directly.`);
  } catch (err) {
    announce(`Could not reset password for ${username}: ${err.message}`);
  }
}

document.getElementById('add-user-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const usernameInput = document.getElementById('new-username');
  const passwordInput = document.getElementById('new-user-password');
  const roleSelect = document.getElementById('new-user-role');
  const username = usernameInput.value.trim();
  const password = passwordInput.value;
  const role = roleSelect.value;
  if (!username || !password) return;
  try {
    const res = await fetch(USERS_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, role }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || `Request failed (${res.status}).`);
    users = body.users;
    renderUsersList();
    usernameInput.value = '';
    passwordInput.value = '';
    roleSelect.value = 'user';
    announce(`Added ${role} "${username}".`);
  } catch (err) {
    announce(`Could not add user: ${err.message}`);
  }
});

async function init() {
  try {
    const whoamiRes = await fetch('/api/whoami');
    if (whoamiRes.status === 401) {
      unauthorizedEl.hidden = false;
      return;
    }
    const whoami = await whoamiRes.json();
    if (whoami.role !== 'admin') {
      unauthorizedEl.hidden = false;
      return;
    }
    viewerUsername = whoami.username;
    viewerUsernameEl.textContent = whoami.username;

    const res = await fetch(RULES_API);
    if (res.status === 401 || res.status === 403) {
      unauthorizedEl.hidden = false;
      return;
    }
    if (!res.ok) throw new Error(`Request failed (${res.status}).`);
    store = await res.json();
    contentEl.hidden = false;
    renderOverridesList();
    await fetchUsers();
  } catch (err) {
    unauthorizedEl.hidden = false;
    unauthorizedEl.querySelector('p').textContent = `Could not load admin data: ${err.message}`;
  }
}

init();
