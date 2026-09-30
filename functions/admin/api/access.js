// Manages who can reach /admin* by editing the Cloudflare Access "Allow"
// policy's email list directly via the Cloudflare API — this is the real
// security boundary, the same list the Zero Trust dashboard shows. The KV
// directory alongside it only adds descriptive metadata (role label, who
// invited whom, when) that Access itself doesn't track; if an email is
// ever added straight from the dashboard instead of this page, it still
// shows up here (Cloudflare's policy is always re-read as the source of
// truth), just without that metadata.
//
// Protected the same way as functions/admin/api/rules.js — this whole path
// sits under /admin*, behind Cloudflare Access, and every handler here
// additionally requires the Cf-Access-Authenticated-User-Email header
// Access injects.
const KV_KEY = 'admin-directory';

function requireAccessEmail(request) {
  return request.headers.get('Cf-Access-Authenticated-User-Email') || null;
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function unauthorized() {
  return json({ error: 'Not authenticated. This endpoint requires signing in via Cloudflare Access on /admin.' }, 401);
}

function notConfigured() {
  return json(
    {
      error:
        'Admin access management is not configured yet. Set the CF_API_TOKEN secret and the CF_ACCOUNT_ID / ACCESS_APP_ID vars — see README "Admin access controls".',
    },
    501
  );
}

function isConfigured(env) {
  return Boolean(env.CF_API_TOKEN && env.CF_ACCOUNT_ID && env.ACCESS_APP_ID && !env.CF_ACCOUNT_ID.startsWith('REPLACE_'));
}

async function cfFetch(env, path, options = {}) {
  const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${env.CF_API_TOKEN}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    const message = (data.errors || []).map((e) => e.message).join('; ') || `Cloudflare API request failed (${res.status}).`;
    throw new Error(message);
  }
  return data.result;
}

async function getAllowPolicy(env) {
  const policies = await cfFetch(env, `/accounts/${env.CF_ACCOUNT_ID}/access/apps/${env.ACCESS_APP_ID}/policies`);
  const policy = policies.find((p) => p.decision === 'allow');
  if (!policy) throw new Error('No "Allow" policy found on the configured Access application.');
  return policy;
}

function emailsFromPolicy(policy) {
  return (policy.include || []).map((rule) => rule.email && rule.email.email).filter(Boolean);
}

async function setPolicyEmails(env, policy, emails) {
  const nonEmailIncludes = (policy.include || []).filter((rule) => !rule.email);
  const body = { ...policy, include: [...nonEmailIncludes, ...emails.map((email) => ({ email: { email } }))] };
  delete body.id;
  delete body.created_at;
  delete body.updated_at;
  await cfFetch(env, `/accounts/${env.CF_ACCOUNT_ID}/access/apps/${env.ACCESS_APP_ID}/policies/${policy.id}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

async function readDirectory(env) {
  const raw = await env.UTM_RECORDS.get(KV_KEY);
  return raw ? JSON.parse(raw) : [];
}

async function writeDirectory(env, directory) {
  await env.UTM_RECORDS.put(KV_KEY, JSON.stringify(directory));
}

function mergedAdmins(allowedEmails, directory) {
  return allowedEmails.map((email) => {
    const entry = directory.find((d) => d.email.toLowerCase() === email.toLowerCase());
    return entry || { email, role: 'Admin', addedBy: null, addedAt: null };
  });
}

export async function onRequestGet({ request, env }) {
  const viewerEmail = requireAccessEmail(request);
  if (!viewerEmail) return unauthorized();
  if (!isConfigured(env)) return notConfigured();

  try {
    const policy = await getAllowPolicy(env);
    const admins = mergedAdmins(emailsFromPolicy(policy), await readDirectory(env));
    return json({ admins, viewerEmail });
  } catch (err) {
    return json({ error: err.message }, 502);
  }
}

export async function onRequestPost({ request, env }) {
  const viewerEmail = requireAccessEmail(request);
  if (!viewerEmail) return unauthorized();
  if (!isConfigured(env)) return notConfigured();

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Request body must be JSON.' }, 400);
  }
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const role = typeof body.role === 'string' && body.role.trim() ? body.role.trim() : 'Admin';
  if (!email || !email.includes('@')) return json({ error: 'A valid email is required.' }, 400);

  try {
    const policy = await getAllowPolicy(env);
    const allowedEmails = emailsFromPolicy(policy);
    const alreadyAllowed = allowedEmails.some((e) => e.toLowerCase() === email);
    const newAllowedEmails = alreadyAllowed ? allowedEmails : [...allowedEmails, email];
    if (!alreadyAllowed) await setPolicyEmails(env, policy, newAllowedEmails);

    const directory = (await readDirectory(env)).filter((d) => d.email.toLowerCase() !== email);
    directory.push({ email, role, addedBy: viewerEmail, addedAt: new Date().toISOString() });
    await writeDirectory(env, directory);

    return json({ admins: mergedAdmins(newAllowedEmails, directory), viewerEmail });
  } catch (err) {
    return json({ error: err.message }, 502);
  }
}

export async function onRequestDelete({ request, env }) {
  const viewerEmail = requireAccessEmail(request);
  if (!viewerEmail) return unauthorized();
  if (!isConfigured(env)) return notConfigured();

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Request body must be JSON.' }, 400);
  }
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!email) return json({ error: 'email is required.' }, 400);
  if (email === viewerEmail.toLowerCase()) return json({ error: "You can't remove your own admin access." }, 400);

  try {
    const policy = await getAllowPolicy(env);
    const allowedEmails = emailsFromPolicy(policy);
    if (allowedEmails.length <= 1) return json({ error: "Can't remove the last remaining admin." }, 400);
    if (!allowedEmails.some((e) => e.toLowerCase() === email)) return json({ error: 'That email is not currently an admin.' }, 404);

    const newAllowedEmails = allowedEmails.filter((e) => e.toLowerCase() !== email);
    await setPolicyEmails(env, policy, newAllowedEmails);

    const directory = (await readDirectory(env)).filter((d) => d.email.toLowerCase() !== email);
    await writeDirectory(env, directory);

    return json({ admins: mergedAdmins(newAllowedEmails, directory), viewerEmail });
  } catch (err) {
    return json({ error: err.message }, 502);
  }
}
