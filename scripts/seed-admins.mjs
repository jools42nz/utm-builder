// One-time helper for creating the first admin account(s) — see README
// "Authentication". After this, every other account (admin or general user)
// is created through the Admin page's "Manage users" section instead.
//
// Usage:
//   node scripts/seed-admins.mjs alice@port.ac.uk:correct-horse-battery bob@port.ac.uk:another-password
//
// Each "username:password" pair becomes an admin account. Writes the
// resulting JSON to ./users-seed.json (in the repo root) and prints the
// exact `wrangler kv key put` command to load it — reusing the same
// PBKDF2 hashing functions/admin/api/users.js verifies against, so a
// password set this way logs in exactly like one set through the app.
import { writeFileSync } from 'node:fs';
import { hashPassword } from '../functions/_lib/users.js';

// Keep in sync with functions/admin/api/users.js — new usernames must be a
// @port.ac.uk address. Existing accounts created before this requirement
// aren't affected; this only matters the next time this script is run.
const USERNAME_PATTERN = /^[a-z0-9._-]+@port\.ac\.uk$/i;

const pairs = process.argv.slice(2);
if (pairs.length === 0) {
  console.error('Usage: node scripts/seed-admins.mjs username@port.ac.uk:password [username@port.ac.uk:password ...]');
  process.exit(1);
}

const users = [];
for (const pair of pairs) {
  const separatorIndex = pair.indexOf(':');
  if (separatorIndex === -1) {
    console.error(`Skipping "${pair}" — expected "username@port.ac.uk:password".`);
    continue;
  }
  const username = pair.slice(0, separatorIndex).trim();
  const password = pair.slice(separatorIndex + 1);
  if (!USERNAME_PATTERN.test(username) || password.length < 8) {
    console.error(`Skipping "${username || pair}" — username must be a @port.ac.uk address, password needs 8+ characters.`);
    continue;
  }
  users.push({
    username,
    passwordHash: await hashPassword(password),
    role: 'admin',
    addedBy: 'seed-admins.mjs',
    addedAt: new Date().toISOString(),
  });
}

if (users.length === 0) {
  console.error('No valid username:password pairs — nothing written.');
  process.exit(1);
}

const outFile = 'users-seed.json';
writeFileSync(outFile, JSON.stringify(users));

console.log(`Wrote ${users.length} admin account(s) to ./${outFile}.\n`);
console.log('Now load it into KV (replace <namespace-id> if wrangler.toml\'s UTM_RECORDS id ever changes):');
console.log(`  npx wrangler kv key put --namespace-id=3ba579c4196c4d35942de027d992f8a0 "users" --path=${outFile}\n`);
console.log('This OVERWRITES the entire "users" key — only run it once, before any users exist. Adding');
console.log('people after that goes through the Admin page\'s "Manage users" section instead.\n');
console.log(`Delete ./${outFile} once the command above has run — it holds password hashes, not plaintext,`);
console.log('but there\'s no reason to leave it lying around.');
