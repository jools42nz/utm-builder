/**
 * Local-only, illustrative store behind the Admin page's "Manage users"
 * list. It is NOT real authentication — these accounts don't gate access
 * to anything yet, and nothing is shared between browsers. The real,
 * password-checked accounts system lives on the feature/user-accounts-auth
 * branch and is meant to replace this file once it's merged in.
 */

const STORAGE_KEY = 'utm-builder:users';
const USERNAME_PATTERN = /^[a-z0-9._-]{3,50}$/i;
const MIN_PASSWORD_LENGTH = 8;

function read() {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? JSON.parse(raw) : [];
}

function write(users) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(users));
}

export function listUsers() {
  return read();
}

export function validateUsername(username) {
  return USERNAME_PATTERN.test(username.trim());
}

export function validatePassword(password) {
  return password.length >= MIN_PASSWORD_LENGTH;
}

export function addUser({ username, password, role }) {
  const trimmed = username.trim();
  if (!validateUsername(trimmed)) {
    throw new Error('Username must be 3-50 characters: letters, numbers, dots, underscores or hyphens.');
  }
  if (!validatePassword(password)) {
    throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
  const users = read();
  if (users.some((u) => u.username.toLowerCase() === trimmed.toLowerCase())) {
    throw new Error(`"${trimmed}" already exists.`);
  }
  const user = {
    username: trimmed,
    role: role === 'admin' ? 'admin' : 'user',
    addedAt: new Date().toISOString(),
    passwordUpdatedAt: new Date().toISOString(),
  };
  users.push(user);
  write(users);
  return user;
}

export function resetPassword(username, password) {
  if (!validatePassword(password)) {
    throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
  const users = read();
  const user = users.find((u) => u.username === username);
  if (!user) throw new Error(`"${username}" was not found.`);
  user.passwordUpdatedAt = new Date().toISOString();
  write(users);
  return user;
}

export function removeUser(username) {
  const users = read();
  const target = users.find((u) => u.username === username);
  if (!target) return read();
  const adminCount = users.filter((u) => u.role === 'admin').length;
  if (target.role === 'admin' && adminCount <= 1) {
    throw new Error("Can't remove the last remaining admin.");
  }
  write(users.filter((u) => u.username !== username));
  return read();
}
