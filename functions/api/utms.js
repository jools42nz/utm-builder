// Cloudflare Pages Function backing the shared view when dataAccess.js's
// BACKEND constant is set to 'cloudflare'. Reads/writes a single JSON array
// under one KV key — fine at this app's expected scale (a shared marketing
// UTM list, not a high-write-throughput store).
const KV_KEY = 'records';

export async function onRequestGet({ env }) {
  const raw = await env.UTM_RECORDS.get(KV_KEY);
  return new Response(raw || '[]', {
    headers: { 'content-type': 'application/json' },
  });
}

export async function onRequestPost({ request, env }) {
  let incoming;
  try {
    incoming = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Request body must be JSON.' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }
  if (!Array.isArray(incoming)) {
    return new Response(JSON.stringify({ error: 'Request body must be an array of records.' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }

  const raw = await env.UTM_RECORDS.get(KV_KEY);
  const existing = raw ? JSON.parse(raw) : [];
  const updated = existing.concat(incoming);
  await env.UTM_RECORDS.put(KV_KEY, JSON.stringify(updated));

  return new Response(JSON.stringify(updated), {
    headers: { 'content-type': 'application/json' },
  });
}
