import { createHmac, createHash, randomBytes, timingSafeEqual } from "crypto";

// Authenticator-app codes (RFC 6238, 6 digits / 30 s / SHA-1) with no extra packages.
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf) {
  let bits = 0, value = 0, out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) { out += ALPHABET[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(str) {
  const clean = String(str).toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0, value = 0;
  const out = [];
  for (const ch of clean) {
    value = (value << 5) | ALPHABET.indexOf(ch);
    bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

export function generateSecret() {
  return base32Encode(randomBytes(20));
}

export function hotp(secretB32, counter, digits = 6) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const h = createHmac("sha1", base32Decode(secretB32)).update(buf).digest();
  const off = h[h.length - 1] & 15;
  const bin = ((h[off] & 0x7f) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3];
  return String(bin % 10 ** digits).padStart(digits, "0");
}

export const totpAt = (secretB32, ms = Date.now()) => hotp(secretB32, Math.floor(ms / 30000));

// Returns the matching time step (so a code can't be reused) or null. Allows ±1 step of clock drift.
export function verifyTotp(secretB32, code, { ms = Date.now(), lastStep = 0 } = {}) {
  const c = String(code || "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(c)) return null;
  const now = Math.floor(ms / 30000);
  for (const step of [now, now - 1, now + 1]) {
    const expected = Buffer.from(hotp(secretB32, step));
    if (timingSafeEqual(expected, Buffer.from(c)) && step > lastStep) return step;
  }
  return null;
}

export function otpauthUri(secretB32, account, issuer = "Let's Yap") {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${secretB32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

const hashCode = (c) => createHash("sha256").update(String(c).toLowerCase().replace(/[^a-z0-9]/g, "")).digest("hex");

export function generateBackupCodes(n = 8) {
  const plain = Array.from({ length: n }, () => {
    const raw = randomBytes(5).toString("hex"); // 10 hex chars
    return `${raw.slice(0, 5)}-${raw.slice(5)}`;
  });
  return { plain, hashed: plain.map(hashCode) };
}

// If `code` is an unused backup code, returns the remaining hashed list; else null.
export function consumeBackupCode(hashedList, code) {
  const h = hashCode(code);
  const i = hashedList.indexOf(h);
  if (i < 0) return null;
  return hashedList.filter((_, j) => j !== i);
}

// Short-lived proof that the password step passed; exchanged for a real login after the code is checked.
export function parseBackup(json) {
  try { const a = JSON.parse(json || "[]"); return Array.isArray(a) ? a : []; } catch { return []; }
}
