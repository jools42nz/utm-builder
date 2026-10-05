import { verifySession } from '../_lib/session.js';

export async function onRequestGet({ request, env }) {
  const session = await verifySession(request, env);
  if (!session) {
    return new Response(JSON.stringify({ error: 'Not signed in.' }), { status: 401, headers: { 'content-type': 'application/json' } });
  }
  return new Response(JSON.stringify(session), { headers: { 'content-type': 'application/json' } });
}
