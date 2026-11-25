// Wrong passwords per account (email or employee code), on top of the per-IP limit: after MAX_FAILS
// wrong tries within WINDOW_MS the account waits LOCK_MS. A right password clears the count.
// Kept in memory: a restart forgets the count, which only ever makes it more lenient, never locks anyone in.
const MAX_FAILS = 10;
const WINDOW_MS = 15 * 60 * 1000;
const LOCK_MS = 15 * 60 * 1000;
const MAX_KEYS = 20000;
const tries = new Map();

const keyOf = (kind, value) => `${kind}:${String(value || '').trim().toLowerCase()}`;

// Minutes left before this account may try again, or 0.
function lockedFor(key) {
  const entry = tries.get(key);
  if (!entry || !entry.lockedUntil) return 0;
  const left = entry.lockedUntil - Date.now();
  if (left <= 0) { tries.delete(key); return 0; }
  return Math.ceil(left / 60000);
}

function failed(key) {
  const now = Date.now();
  let entry = tries.get(key);
  if (!entry || now - entry.first > WINDOW_MS) entry = { count: 0, first: now, lockedUntil: 0 };
  entry.count += 1;
  if (entry.count >= MAX_FAILS) entry.lockedUntil = now + LOCK_MS;
  if (!tries.has(key) && tries.size >= MAX_KEYS) tries.delete(tries.keys().next().value);
  tries.set(key, entry);
}

const succeeded = (key) => { tries.delete(key); };
const lockedMessage = (minutes, help = 'Or reset your password.') => ({ error: `Too many wrong passwords for this account. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}. ${help}`, code: 'ACCOUNT_LOCKED' });

module.exports = { keyOf, lockedFor, failed, succeeded, lockedMessage, MAX_FAILS };
