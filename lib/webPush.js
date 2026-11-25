import crypto from "crypto";
import pool from "./db.js";
import { ensureSchema } from "./ensureSchema.js";

// Web Push (RFC 8030 + RFC 8291 aes128gcm + RFC 8292 VAPID) using only node's crypto,
// so there is nothing to install and no keys to set up: the VAPID key pair is made
// once and kept in the database (table app_secrets).

const b64u = (buf) => Buffer.from(buf).toString("base64url");
const fromB64u = (s) => Buffer.from(s, "base64url");

let vapidCache = null;
export async function getVapid() {
  if (vapidCache) return vapidCache;
  await ensureSchema();
  const [rows] = await pool.query("SELECT value FROM app_secrets WHERE name = 'vapid'");
  let jwk;
  if (rows[0]) jwk = JSON.parse(rows[0].value);
  else {
    const { privateKey } = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    jwk = privateKey.export({ format: "jwk" });
    // INSERT IGNORE: if two servers race, the first key wins and both re-read it
    await pool.query("INSERT IGNORE INTO app_secrets (name, value) VALUES ('vapid', ?)", [JSON.stringify(jwk)]);
    const [again] = await pool.query("SELECT value FROM app_secrets WHERE name = 'vapid'");
    jwk = JSON.parse(again[0].value);
  }
  const privateKey = crypto.createPrivateKey({ key: jwk, format: "jwk" });
  const publicKey = Buffer.concat([Buffer.from([4]), fromB64u(jwk.x), fromB64u(jwk.y)]);
  vapidCache = { privateKey, publicKey: b64u(publicKey) };
  return vapidCache;
}

export function vapidAuthHeader(endpoint, vapid, subject = process.env.VAPID_SUBJECT || "mailto:admin@letsyap.app", now = Date.now()) {
  const aud = new URL(endpoint).origin;
  const head = b64u(JSON.stringify({ typ: "JWT", alg: "ES256" }));
  const body = b64u(JSON.stringify({ aud, exp: Math.floor(now / 1000) + 12 * 3600, sub: subject }));
  const sig = crypto.sign("sha256", Buffer.from(`${head}.${body}`), { key: vapid.privateKey, dsaEncoding: "ieee-p1363" });
  return `vapid t=${head}.${body}.${b64u(sig)}, k=${vapid.publicKey}`;
}

// RFC 8291 payload encryption. `eph` and `salt` can be injected for test vectors.
export function encryptPayload(subscription, plaintext, { eph, salt } = {}) {
  const uaPublic = fromB64u(subscription.p256dh);
  const authSecret = fromB64u(subscription.auth);
  const ecdh = eph ? null : crypto.createECDH("prime256v1");
  if (ecdh) ecdh.generateKeys();
  const e = eph || ecdh;
  const asPublic = e.getPublicKey();
  const shared = e.computeSecret(uaPublic);
  const s = salt || crypto.randomBytes(16);
  const keyInfo = Buffer.concat([Buffer.from("WebPush: info\0"), uaPublic, asPublic]);
  const ikm = Buffer.from(crypto.hkdfSync("sha256", shared, authSecret, keyInfo, 32));
  const cek = Buffer.from(crypto.hkdfSync("sha256", ikm, s, Buffer.from("Content-Encoding: aes128gcm\0"), 16));
  const nonce = Buffer.from(crypto.hkdfSync("sha256", ikm, s, Buffer.from("Content-Encoding: nonce\0"), 12));
  const data = Buffer.concat([Buffer.from(plaintext), Buffer.from([2])]); // 0x02 = last record delimiter
  const cipher = crypto.createCipheriv("aes-128-gcm", cek, nonce);
  const enc = Buffer.concat([cipher.update(data), cipher.final(), cipher.getAuthTag()]);
  const rs = Buffer.alloc(4);
  rs.writeUInt32BE(4096);
  return Buffer.concat([s, rs, Buffer.from([asPublic.length]), asPublic, enc]);
}

// Counterpart a browser performs; used by the tests to prove the encryption round-trips.
export function decryptPayload(body, uaPrivateECDH, authSecretB64) {
  const salt = body.subarray(0, 16);
  const idlen = body[20];
  const asPublic = body.subarray(21, 21 + idlen);
  const enc = body.subarray(21 + idlen);
  const uaPublic = uaPrivateECDH.getPublicKey();
  const shared = uaPrivateECDH.computeSecret(asPublic);
  const keyInfo = Buffer.concat([Buffer.from("WebPush: info\0"), uaPublic, asPublic]);
  const ikm = Buffer.from(crypto.hkdfSync("sha256", shared, fromB64u(authSecretB64), keyInfo, 32));
  const cek = Buffer.from(crypto.hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0"), 16));
  const nonce = Buffer.from(crypto.hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: nonce\0"), 12));
  const d = crypto.createDecipheriv("aes-128-gcm", cek, nonce);
  d.setAuthTag(enc.subarray(enc.length - 16));
  const out = Buffer.concat([d.update(enc.subarray(0, enc.length - 16)), d.final()]);
  return out.subarray(0, out.lastIndexOf(2)).toString();
}

async function sendOne(sub, payload, { urgency = "normal", ttl = 3600 } = {}) {
  const vapid = await getVapid();
  const body = encryptPayload(sub, JSON.stringify(payload));
  const res = await fetch(sub.endpoint, {
    method: "POST",
    headers: {
      Authorization: vapidAuthHeader(sub.endpoint, vapid),
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: String(ttl),
      Urgency: urgency
    },
    body,
    signal: AbortSignal.timeout(8000)
  });
  return res.status;
}

// Push to every device the user enabled notifications on. Dead subscriptions are removed.
export async function pushToUser(userId, payload, opts) {
  try {
    await ensureSchema();
    const [subs] = await pool.query("SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?", [userId]);
    await Promise.all(subs.map(async (sub) => {
      try {
        const status = await sendOne(sub, payload, opts);
        if (status === 404 || status === 410) await pool.query("DELETE FROM push_subscriptions WHERE id = ?", [sub.id]);
        else if (status >= 400) console.error(`Push to ${new URL(sub.endpoint).host} failed: ${status}`);
      } catch (err) {
        console.error("Push error:", err.message);
      }
    }));
  } catch (err) {
    console.error("pushToUser:", err.message);
  }
}
