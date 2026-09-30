// Gates every request behind the two-tier passphrase login — the whole site
// needs a valid session, and /admin* additionally needs the admin role. Runs
// ahead of both static asset serving and the other Functions, which is the
// only way to protect plain HTML pages on a static Pages site (there's no
// per-page server render to hang a check on otherwise).
//
// Deliberately simple, matching the rest of this auth model: two shared
// passphrases, no accounts — see functions/_lib/session.js and README
// "Authentication".
import { verifySession } from './_lib/session.js';

const PUBLIC_PREFIXES = ['/login', '/api/login', '/favicon/', '/css/', '/js/', '/robots.txt', '/llms.txt'];

function isPublic(pathname) {
  return PUBLIC_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix));
}

function jsonResponse(body, status) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function forbiddenPage() {
  return new Response(
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Forbidden</title></head><body style="font-family: sans-serif; padding: 3rem; max-width: 40rem; margin: 0 auto;"><h1>Admin access required</h1><p>Your sign-in doesn\'t have admin access. Ask an existing admin for the admin passphrase, or go back to <a href="/">the builder</a>.</p></body></html>',
    { status: 403, headers: { 'content-type': 'text/html; charset=utf-8' } }
  );
}

export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);

  if (isPublic(url.pathname)) return next();

  const isApiPath = url.pathname.startsWith('/api/') || url.pathname.startsWith('/admin/api/');
  const session = await verifySession(request, env);

  if (!session) {
    if (isApiPath) return jsonResponse({ error: 'Not signed in.' }, 401);
    const redirectTo = encodeURIComponent(url.pathname + url.search);
    return Response.redirect(`${url.origin}/login?redirect=${redirectTo}`, 302);
  }

  if (url.pathname.startsWith('/admin') && session.role !== 'admin') {
    return isApiPath ? jsonResponse({ error: 'Admin access required.' }, 403) : forbiddenPage();
  }

  return next();
}
