// Public, unauthenticated read of admin-added dropdown values (see
// functions/admin/api/rules.js for the write side, gated behind Cloudflare
// Access on /admin*). Every visitor's builder page calls this to merge
// admin-added Campaigns/Sources/Content into js/rules.js's static lists —
// it deliberately strips the addedBy/addedAt metadata the admin view
// exposes, so it never leaks staff email addresses to an unauthenticated
// caller.
const KV_KEY = 'rules-overrides';

function emptyOverrides() {
  return { campaigns: [], content: [], sources: {} };
}

export async function onRequestGet({ env }) {
  const raw = await env.UTM_RECORDS.get(KV_KEY);
  const stored = raw ? JSON.parse(raw) : { campaigns: [], content: [], sources: [] };

  const overrides = emptyOverrides();
  overrides.campaigns = (stored.campaigns || []).map((o) => o.value);
  overrides.content = (stored.content || []).map((o) => o.value);
  for (const o of stored.sources || []) {
    (overrides.sources[o.term] ||= []).push(o.value);
  }

  return new Response(JSON.stringify(overrides), {
    headers: { 'content-type': 'application/json' },
  });
}
