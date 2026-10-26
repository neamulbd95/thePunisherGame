import crypto from 'node:crypto';

export const newToken = () => crypto.randomBytes(32).toString('base64url');
export const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
export const hmacHex = (key, msg) => crypto.createHmac('sha256', key).update(msg).digest('hex');

export function safeEqualHex(a, b) {
  const x = Buffer.from(String(a), 'hex');
  const y = Buffer.from(String(b), 'hex');
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
}

// Unambiguous alphabet (no 0/O/1/I) for friend codes and recovery codes.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function randomFrom(len) {
  const bytes = crypto.randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

export const newFriendCode = (len = 8) => randomFrom(len);

/** 20 characters from a 32 symbol alphabet = 100 bits, shown as XXXX-XXXX-XXXX-XXXX-XXXX. */
export const newRecoveryCode = () => randomFrom(20).match(/.{4}/g).join('-');

/** Accepts the code however the player typed it (lower case, spaces, missing dashes). */
export const normalizeRecoveryCode = (s) => String(s).toUpperCase().replace(/[^A-Z0-9]/g, '');
