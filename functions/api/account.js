// Self-service password change — any signed-in account (user or admin) can
// change their own password here, without needing an admin. Scoped strictly
// to the caller's own account: the username always comes from the verified
// session, never from the request body, so there's no way to target anyone
// else's account through this endpoint.
import { verifySession } from '../_lib/session.js';
import { readUsers, writeUsers, findUser, verifyPassword, hashPassword } from '../_lib/users.js';

const MIN_PASSWORD_LENGTH = 8;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

export async function onRequestPut({ request, env }) {
  const session = await verifySession(request, env);
  if (!session) return json({ error: 'Not signed in.' }, 401);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Request body must be JSON.' }, 400);
  }

  const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : '';
  const newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return json({ error: `New password must be at least ${MIN_PASSWORD_LENGTH} characters.` }, 400);
  }

  const users = await readUsers(env);
  const user = findUser(users, session.username);
  if (!user) return json({ error: 'Account not found.' }, 404);

  if (!(await verifyPassword(currentPassword, user.passwordHash))) {
    return json({ error: 'Current password is incorrect.' }, 401);
  }

  user.passwordHash = await hashPassword(newPassword);
  await writeUsers(env, users);

  return json({ ok: true });
}
