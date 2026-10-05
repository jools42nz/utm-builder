import { createSessionCookie } from '../_lib/session.js';
import { readUsers, findUser, verifyPassword } from '../_lib/users.js';

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Request body must be JSON.' }), { status: 400, headers: { 'content-type': 'application/json' } });
  }

  if (!env.SESSION_SECRET) {
    return new Response(JSON.stringify({ error: 'Sign-in is not configured yet — see README "Authentication".' }), {
      status: 501,
      headers: { 'content-type': 'application/json' },
    });
  }

  const username = typeof body.username === 'string' ? body.username.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!username || !password) {
    return new Response(JSON.stringify({ error: 'Username and password are required.' }), { status: 400, headers: { 'content-type': 'application/json' } });
  }

  const users = await readUsers(env);
  const user = findUser(users, username);
  const valid = user && (await verifyPassword(password, user.passwordHash));

  if (!valid) {
    return new Response(JSON.stringify({ error: 'Incorrect username or password.' }), { status: 401, headers: { 'content-type': 'application/json' } });
  }

  return new Response(JSON.stringify({ username: user.username, role: user.role }), {
    status: 200,
    headers: { 'content-type': 'application/json', 'set-cookie': await createSessionCookie(user.username, user.role, env) },
  });
}
