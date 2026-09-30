// Shared session-cookie helpers for the two-tier passphrase auth
// (functions/_middleware.js, functions/api/login.js, functions/api/logout.js,
// functions/admin/api/rules.js). Deliberately simple: no accounts, no
// database of users — just two shared secrets (USER_PASSPHRASE,
// ADMIN_PASSPHRASE) and a signed cookie recording which one was used.
const COOKIE_NAME = 'utm_session';
const SESSION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

function base64UrlEncode(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((value.length + 3) % 4);
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

async function hmac(secret, message) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return base64UrlEncode(new Uint8Array(signature));
}

/** Constant-time-ish string compare — avoids a trivial length/short-circuit timing tell on the passphrase and signature checks. */
export function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

export async function createSessionCookie(role, env) {
  const payload = base64UrlEncode(new TextEncoder().encode(JSON.stringify({ role, exp: Date.now() + SESSION_LIFETIME_MS })));
  const signature = await hmac(env.SESSION_SECRET, payload);
  return `${COOKIE_NAME}=${payload}.${signature}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_LIFETIME_MS / 1000}`;
}

export function clearSessionCookie() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

function readCookie(request, name) {
  const header = request.headers.get('Cookie') || '';
  for (const part of header.split(';')) {
    const trimmed = part.trim();
    if (trimmed.startsWith(`${name}=`)) return trimmed.slice(name.length + 1);
  }
  return null;
}

/** Returns `{ role: 'user' | 'admin' }` for a valid, unexpired, correctly-signed session — otherwise null. */
export async function verifySession(request, env) {
  if (!env.SESSION_SECRET) return null;
  const raw = readCookie(request, COOKIE_NAME);
  if (!raw) return null;
  const [payload, signature] = raw.split('.');
  if (!payload || !signature) return null;

  const expected = await hmac(env.SESSION_SECRET, payload);
  if (!timingSafeEqual(signature, expected)) return null;

  let data;
  try {
    data = JSON.parse(new TextDecoder().decode(base64UrlDecode(payload)));
  } catch {
    return null;
  }
  if ((data.role !== 'user' && data.role !== 'admin') || typeof data.exp !== 'number' || Date.now() > data.exp) return null;
  return { role: data.role };
}
