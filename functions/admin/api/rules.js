// Admin-only management of dropdown values that don't yet exist in
// js/rules.js's static lists — the permanent alternative to picking "Other"
// every time the same new affiliate/campaign/content value comes up.
//
// Protected by the admin-role session cookie from the two-tier passphrase
// login (functions/_middleware.js already blocks non-admins from anything
// under /admin*, including this path — the check here is a second,
// independent guard in case that middleware is ever bypassed or misordered).
// There's no per-user identity in this model, just "someone who knows the
// admin passphrase" — so `addedBy` is whatever name the admin typed in the
// form, not a verified identity.
import { verifySession } from '../../_lib/session.js';

const KV_KEY = 'rules-overrides';
const KINDS = ['campaign', 'content', 'source'];
const MAX_VALUE_LENGTH = 200;
const MAX_NAME_LENGTH = 100;

async function requireAdmin(request, env) {
  const session = await verifySession(request, env);
  return session && session.role === 'admin';
}

function unauthorized() {
  return new Response(JSON.stringify({ error: 'Admin sign-in required.' }), {
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
  if (!(await requireAdmin(request, env))) return unauthorized();
  const store = await readStore(env);
  return new Response(JSON.stringify(store), {
    headers: { 'content-type': 'application/json' },
  });
}

export async function onRequestPost({ request, env }) {
  if (!(await requireAdmin(request, env))) return unauthorized();

  let body;
  try {
    body = await request.json();
  } catch {
    return badRequest('Request body must be JSON.');
  }

  const { kind, value, term, addedBy } = body;
  if (!KINDS.includes(kind)) return badRequest(`kind must be one of: ${KINDS.join(', ')}.`);
  const trimmedValue = typeof value === 'string' ? value.trim() : '';
  if (!trimmedValue || trimmedValue.length > MAX_VALUE_LENGTH) return badRequest(`value is required (max ${MAX_VALUE_LENGTH} characters).`);
  const trimmedTerm = typeof term === 'string' ? term.trim() : '';
  if (kind === 'source' && !trimmedTerm) return badRequest('term is required when kind is "source".');
  const trimmedName = (typeof addedBy === 'string' && addedBy.trim().slice(0, MAX_NAME_LENGTH)) || 'Admin';

  const store = await readStore(env);
  const list = listForKind(store, kind);

  const alreadyExists =
    kind === 'source'
      ? list.some((o) => o.term === trimmedTerm && o.value.toLowerCase() === trimmedValue.toLowerCase())
      : list.some((o) => o.value.toLowerCase() === trimmedValue.toLowerCase());

  if (!alreadyExists) {
    const entry = { value: trimmedValue, addedBy: trimmedName, addedAt: new Date().toISOString() };
    if (kind === 'source') entry.term = trimmedTerm;
    list.push(entry);
    await writeStore(env, store);
  }

  return new Response(JSON.stringify(store), {
    headers: { 'content-type': 'application/json' },
  });
}

export async function onRequestDelete({ request, env }) {
  if (!(await requireAdmin(request, env))) return unauthorized();

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
