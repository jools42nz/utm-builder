// Password hashing and the KV-backed user store for account-based login.
// Pure Web Crypto (crypto.subtle) — works identically in the Cloudflare
// Workers runtime and in plain Node (18+), so scripts/seed-admins.mjs can
// import hashPassword directly instead of reimplementing it.
const KV_KEY = 'users';
const PBKDF2_ITERATIONS = 100000;

function base64UrlEncode(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((value.length + 3) % 4);
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

async function pbkdf2(password, saltBytes, iterations) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: saltBytes, iterations, hash: 'SHA-256' }, key, 256);
  return base64UrlEncode(new Uint8Array(bits));
}

/** `pbkdf2$<iterations>$<saltB64url>$<hashB64url>` — versioned so the iteration count can change later without breaking existing hashes. */
export async function hashPassword(password) {
  const saltBytes = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, saltBytes, PBKDF2_ITERATIONS);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${base64UrlEncode(saltBytes)}$${hash}`;
}

export async function verifyPassword(password, stored) {
  if (typeof stored !== 'string') return false;
  const parts = stored.split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
  const iterations = Number(parts[1]);
  if (!Number.isInteger(iterations) || iterations <= 0) return false;
  const saltBytes = base64UrlDecode(parts[2]);
  const expectedHash = parts[3];
  const actualHash = await pbkdf2(password, saltBytes, iterations);
  if (actualHash.length !== expectedHash.length) return false;
  let mismatch = 0;
  for (let i = 0; i < actualHash.length; i++) mismatch |= actualHash.charCodeAt(i) ^ expectedHash.charCodeAt(i);
  return mismatch === 0;
}

export async function readUsers(env) {
  const raw = await env.UTM_RECORDS.get(KV_KEY);
  return raw ? JSON.parse(raw) : [];
}

export async function writeUsers(env, users) {
  await env.UTM_RECORDS.put(KV_KEY, JSON.stringify(users));
}

export function findUser(users, username) {
  const needle = username.toLowerCase();
  return users.find((u) => u.username.toLowerCase() === needle);
}
