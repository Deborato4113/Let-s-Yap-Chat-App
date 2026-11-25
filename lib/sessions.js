import { randomUUID } from "crypto";
import pool from "./db.js";
import { signToken } from "./jwt.js";
import { ensureSchema } from "./ensureSchema.js";

// One row per signed-in device. The login token carries the session id ("sid"),
// so revoking a session signs that device out on its very next request.
// Tokens issued before sessions existed have no sid; they stay valid until the
// person uses "log out everywhere" (users.tokens_valid_after).

const cache = globalThis.__yapSessionCache || (globalThis.__yapSessionCache = new Map()); // sid -> { ok, at }
const TTL_MS = 15 * 1000;
const TOUCH_MS = 5 * 60 * 1000;
const lastTouch = globalThis.__yapSessionTouch || (globalThis.__yapSessionTouch = new Map());

export function deviceLabel(ua = "") {
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\/|Opera/.test(ua) ? "Opera" : /Firefox\//.test(ua) ? "Firefox"
    : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /Windows/.test(ua) ? "Windows" : /Android/.test(ua) ? "Android" : /iPhone|iPad|iOS/.test(ua) ? "iOS"
    : /Mac OS X|Macintosh/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "";
  return os ? `${browser} on ${os}` : browser;
}

export function requestMeta(req) {
  const ua = req?.headers?.get?.("user-agent") || "";
  const fwd = req?.headers?.get?.("x-forwarded-for") || "";
  return { device: deviceLabel(ua), ip: (fwd.split(",")[0] || req?.headers?.get?.("x-real-ip") || "").trim().slice(0, 64) };
}

export async function createSession(userId, meta = {}) {
  await ensureSchema();
  const sid = randomUUID();
  await pool.query("INSERT INTO sessions (id, user_id, device, ip) VALUES (?, ?, ?, ?)", [
    sid, userId, (meta.device || "Unknown device").slice(0, 255), (meta.ip || "").slice(0, 64)
  ]);
  return sid;
}

// Signs a login token for a brand-new session (call this wherever a login succeeds).
export async function issueToken(user, req) {
  const sid = await createSession(user.id, requestMeta(req));
  return signToken({ id: user.id, sid });
}

// Is this (already signature-verified) token still allowed? userRow is the users row.
export async function sessionIsValid(decoded, userRow) {
  if (!decoded.sid) {
    // legacy token: only "log out everywhere" can invalidate it
    const after = userRow?.tokens_valid_after ? new Date(userRow.tokens_valid_after).getTime() : 0;
    return !after || (decoded.iat || 0) * 1000 >= after;
  }
  await ensureSchema();
  const hit = cache.get(decoded.sid);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.ok;
  const [rows] = await pool.query("SELECT revoked_at FROM sessions WHERE id = ? AND user_id = ?", [decoded.sid, decoded.id]);
  const ok = !!rows[0] && !rows[0].revoked_at;
  cache.set(decoded.sid, { ok, at: Date.now() });
  if (ok && Date.now() - (lastTouch.get(decoded.sid) || 0) > TOUCH_MS) {
    lastTouch.set(decoded.sid, Date.now());
    pool.query("UPDATE sessions SET last_active = ? WHERE id = ?", [new Date(), decoded.sid]).catch(() => {});
  }
  return ok;
}

export async function listSessions(userId) {
  await ensureSchema();
  const [rows] = await pool.query(
    "SELECT id, device, ip, created_at, last_active FROM sessions WHERE user_id = ? AND revoked_at IS NULL ORDER BY last_active DESC LIMIT 50",
    [userId]
  );
  return rows;
}

export async function revokeSession(userId, sid) {
  await ensureSchema();
  const [res] = await pool.query("UPDATE sessions SET revoked_at = ? WHERE id = ? AND user_id = ? AND revoked_at IS NULL", [new Date(), sid, userId]);
  if (res.affectedRows > 0) cache.set(sid, { ok: false, at: Date.now() });
  return res.affectedRows > 0;
}

// Sign out every device (optionally sparing one session) and every pre-sessions token.
export async function revokeAllSessions(userId, exceptSid = null) {
  await ensureSchema();
  const now = new Date();
  const [rows] = await pool.query("SELECT id FROM sessions WHERE user_id = ? AND revoked_at IS NULL", [userId]);
  const ids = rows.map((r) => r.id).filter((id) => id !== exceptSid);
  if (ids.length) await pool.query("UPDATE sessions SET revoked_at = ? WHERE id IN (?)", [now, ids]);
  await pool.query("UPDATE users SET tokens_valid_after = ? WHERE id = ?", [now, userId]);
  ids.forEach((id) => cache.set(id, { ok: false, at: Date.now() }));
  return ids;
}
