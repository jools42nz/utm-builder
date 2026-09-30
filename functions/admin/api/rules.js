// Admin-only management of dropdown values that don't yet exist in
// js/rules.js's static lists — the permanent alternative to picking "Other"
// every time the same new affiliate/campaign/content value comes up.
//
// Protected by a Cloudflare Access application covering /admin* (see README
// "Admin: promoting 'Other' values" for the one-time Zero Trust setup).
// Access injects Cf-Access-Authenticated-User-Email on every request that
// passes its login policy; Cloudflare strips any client-supplied header of
// that name at the edge before it reaches this Function, so its presence
// can't be spoofed by calling this endpoint directly — as long as /admin*
// stays covered by an Access policy in the dashboard. If that policy is
// ever removed, this falls back to rejecting every request (no header, no
// access) rather than silently trusting an unverified caller.
const KV_KEY = 'rules-overrides';
const KINDS = ['campaign', 'content', 'source'];
const MAX_VALUE_LENGTH = 200;

function requireAccessEmail(request) {
  const email = request.headers.get('Cf-Access-Authenticated-User-Email');
  if (!email) return null;
  return email;
}

function unauthorized() {
  return new Response(JSON.stringify({ error: 'Not authenticated. This endpoint requires signing in via Cloudflare Access on /admin.' }), {
    status: 401,
    headers: { 'content-type': 'application/json' },
  });
}

function badRequest(message) {
  return new Response(JSON.stringify({ error: message }), {
    status: 400,
    headers: { 'content-type': 'application/json' },
  });
}

async function readStore(env) {
  const raw = await env.UTM_RECORDS.get(KV_KEY);
  return raw ? JSON.parse(raw) : { campaigns: [], content: [], sources: [] };
}

async function writeStore(env, store) {
  await env.UTM_RECORDS.put(KV_KEY, JSON.stringify(store));
}

function listForKind(store, kind) {
  return kind === 'campaign' ? store.campaigns : kind === 'content' ? store.content : store.sources;
}

export async function onRequestGet({ request, env }) {
  const email = requireAccessEmail(request);
  if (!email) return unauthorized();
  const store = await readStore(env);
  return new Response(JSON.stringify({ ...store, viewerEmail: email }), {
    headers: { 'content-type': 'application/json' },
  });
}

export async function onRequestPost({ request, env }) {
  const email = requireAccessEmail(request);
  if (!email) return unauthorized();

  let body;
  try {
    body = await request.json();
  } catch {
    return badRequest('Request body must be JSON.');
  }

  const { kind, value, term } = body;
  if (!KINDS.includes(kind)) return badRequest(`kind must be one of: ${KINDS.join(', ')}.`);
  const trimmedValue = typeof value === 'string' ? value.trim() : '';
  if (!trimmedValue || trimmedValue.length > MAX_VALUE_LENGTH) return badRequest(`value is required (max ${MAX_VALUE_LENGTH} characters).`);
  const trimmedTerm = typeof term === 'string' ? term.trim() : '';
  if (kind === 'source' && !trimmedTerm) return badRequest('term is required when kind is "source".');

  const store = await readStore(env);
  const list = listForKind(store, kind);

  const alreadyExists =
    kind === 'source'
      ? list.some((o) => o.term === trimmedTerm && o.value.toLowerCase() === trimmedValue.toLowerCase())
      : list.some((o) => o.value.toLowerCase() === trimmedValue.toLowerCase());

  if (!alreadyExists) {
    const entry = { value: trimmedValue, addedBy: email, addedAt: new Date().toISOString() };
    if (kind === 'source') entry.term = trimmedTerm;
    list.push(entry);
    await writeStore(env, store);
  }

  return new Response(JSON.stringify(store), {
    headers: { 'content-type': 'application/json' },
  });
}

export async function onRequestDelete({ request, env }) {
  if (!requireAccessEmail(request)) return unauthorized();

  let body;
  try {
    body = await request.json();
  } catch {
    return badRequest('Request body must be JSON.');
  }

  const { kind, value, term } = body;
  if (!KINDS.includes(kind)) return badRequest(`kind must be one of: ${KINDS.join(', ')}.`);
  const trimmedValue = typeof value === 'string' ? value.trim() : '';
  if (!trimmedValue) return badRequest('value is required.');

  const store = await readStore(env);
  const list = listForKind(store, kind);
  const filtered = list.filter((o) => {
    const sameValue = o.value.toLowerCase() === trimmedValue.toLowerCase();
    if (kind === 'source') return !(sameValue && o.term === term);
    return !sameValue;
  });

  if (kind === 'campaign') store.campaigns = filtered;
  else if (kind === 'content') store.content = filtered;
  else store.sources = filtered;

  await writeStore(env, store);

  return new Response(JSON.stringify(store), {
    headers: { 'content-type': 'application/json' },
  });
}
