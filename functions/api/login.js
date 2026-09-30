import { createSessionCookie, timingSafeEqual } from '../_lib/session.js';

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Request body must be JSON.' }), { status: 400, headers: { 'content-type': 'application/json' } });
  }

  const passphrase = typeof body.passphrase === 'string' ? body.passphrase : '';
  if (!env.USER_PASSPHRASE || !env.ADMIN_PASSPHRASE || !env.SESSION_SECRET) {
    return new Response(JSON.stringify({ error: 'Sign-in is not configured yet — see README "Authentication".' }), {
      status: 501,
      headers: { 'content-type': 'application/json' },
    });
  }

  let role = null;
  if (timingSafeEqual(passphrase, env.ADMIN_PASSPHRASE)) role = 'admin';
  else if (timingSafeEqual(passphrase, env.USER_PASSPHRASE)) role = 'user';

  if (!role) {
    return new Response(JSON.stringify({ error: 'Incorrect passphrase.' }), { status: 401, headers: { 'content-type': 'application/json' } });
  }

  return new Response(JSON.stringify({ role }), {
    status: 200,
    headers: { 'content-type': 'application/json', 'set-cookie': await createSessionCookie(role, env) },
  });
}
