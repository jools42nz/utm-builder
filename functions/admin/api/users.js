// Admin-only user management — the in-app replacement for a 3rd-party IdP.
// Only 3 admins are expected; everyone else is a general "user" account,
// created and removed manually by an admin through /admin. There's no
// self-service signup and no password-reset email; an admin resets a
// forgotten password directly here.
import { verifySession } from '../../_lib/session.js';
import { readUsers, writeUsers, findUser, hashPassword } from '../../_lib/users.js';

const USERNAME_PATTERN = /^[a-z0-9._-]{3,50}$/i;
const MIN_PASSWORD_LENGTH = 8;

async function requireAdmin(request, env) {
  const session = await verifySession(request, env);
  return session && session.role === 'admin' ? session : null;
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function unauthorized() {
  return json({ error: 'Admin sign-in required.' }, 401);
}

function publicUser(user) {
  return { username: user.username, role: user.role, addedBy: user.addedBy, addedAt: user.addedAt };
}

export async function onRequestGet({ request, env }) {
  if (!(await requireAdmin(request, env))) return unauthorized();
  const users = await readUsers(env);
  return json({ users: users.map(publicUser) });
}

export async function onRequestPost({ request, env }) {
  const session = await requireAdmin(request, env);
  if (!session) return unauthorized();

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Request body must be JSON.' }, 400);
  }

  const username = typeof body.username === 'string' ? body.username.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const role = body.role === 'admin' ? 'admin' : 'user';

  if (!USERNAME_PATTERN.test(username)) {
    return json({ error: 'Username must be 3-50 characters: letters, numbers, dots, hyphens or underscores.' }, 400);
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` }, 400);
  }

  const users = await readUsers(env);
  if (findUser(users, username)) {
    return json({ error: `"${username}" already exists.` }, 409);
  }

  users.push({ username, passwordHash: await hashPassword(password), role, addedBy: session.username, addedAt: new Date().toISOString() });
  await writeUsers(env, users);

  return json({ users: users.map(publicUser) });
}

export async function onRequestPut({ request, env }) {
  if (!(await requireAdmin(request, env))) return unauthorized();

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Request body must be JSON.' }, 400);
  }

  const username = typeof body.username === 'string' ? body.username.trim() : '';
  const newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` }, 400);
  }

  const users = await readUsers(env);
  const user = findUser(users, username);
  if (!user) return json({ error: `"${username}" doesn't exist.` }, 404);

  user.passwordHash = await hashPassword(newPassword);
  await writeUsers(env, users);

  return json({ users: users.map(publicUser) });
}

export async function onRequestDelete({ request, env }) {
  const session = await requireAdmin(request, env);
  if (!session) return unauthorized();

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Request body must be JSON.' }, 400);
  }

  const username = typeof body.username === 'string' ? body.username.trim() : '';
  if (!username) return json({ error: 'username is required.' }, 400);
  if (username.toLowerCase() === session.username.toLowerCase()) {
    return json({ error: "You can't remove your own account." }, 400);
  }

  const users = await readUsers(env);
  const target = findUser(users, username);
  if (!target) return json({ error: `"${username}" doesn't exist.` }, 404);

  const remainingAdmins = users.filter((u) => u.role === 'admin' && u.username.toLowerCase() !== username.toLowerCase());
  if (target.role === 'admin' && remainingAdmins.length === 0) {
    return json({ error: "Can't remove the last remaining admin." }, 400);
  }

  const filtered = users.filter((u) => u.username.toLowerCase() !== username.toLowerCase());
  await writeUsers(env, filtered);

  return json({ users: filtered.map(publicUser) });
}
