// Admin-only deletion of a single shared-view UTM record — e.g. removing
// something submitted in error, or clearing out a batch of old entries by
// filtering down to them in the Shared view and deleting each one.
//
// functions/_middleware.js already blocks non-admins from anything under
// /admin*; the check here is a second, independent guard in case that
// middleware is ever bypassed or misordered — same pattern as
// functions/admin/api/rules.js and functions/admin/api/users.js.
import { verifySession } from '../../_lib/session.js';

const KV_KEY = 'records';

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

export async function onRequestDelete({ request, env }) {
  if (!(await requireAdmin(request, env))) return unauthorized();

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Request body must be JSON.' }, 400);
  }

  const id = typeof body.id === 'string' ? body.id : '';
  if (!id) return json({ error: 'id is required.' }, 400);

  const raw = await env.UTM_RECORDS.get(KV_KEY);
  const existing = raw ? JSON.parse(raw) : [];
  const filtered = existing.filter((r) => r.id !== id);

  if (filtered.length === existing.length) {
    return json({ error: 'UTM not found — it may have already been removed.' }, 404);
  }

  await env.UTM_RECORDS.put(KV_KEY, JSON.stringify(filtered));
  return json(filtered);
}
