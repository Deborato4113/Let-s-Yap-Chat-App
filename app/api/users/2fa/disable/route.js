import pool from "@/lib/db";
import { getUserFromRequest } from "@/lib/authServer";
import { verifyTotp, consumeBackupCode, parseBackup } from "@/lib/totp";
import { tooManyAttempts, recordFailure, clearFailures } from "@/lib/loginFlow";

// Turning it off needs a current authenticator code (or an unused backup code).
export async function POST(req) {
  const me = await getUserFromRequest(req);
  if (!me) return Response.json({ message: "Missing or invalid auth token." }, { status: 401 });
  const { code } = await req.json();
  if (!me.totp_enabled) return Response.json({ message: "Two-step verification is already off." }, { status: 400 });
  const key = `2fa-disable:${me.id}`;
  if (tooManyAttempts(key)) return Response.json({ message: "Too many wrong codes. Wait a few minutes and try again." }, { status: 429 });
  const input = String(code || "").trim();
  const ok = !!verifyTotp(me.totp_secret, input, { lastStep: Number(me.totp_last_step) || 0 }) ||
    !!consumeBackupCode(parseBackup(me.totp_backup), input);
  if (!ok) {
    recordFailure(key);
    return Response.json({ message: "That code is not right." }, { status: 400 });
  }
  clearFailures(key);
  await pool.query("UPDATE users SET totp_enabled = 0, totp_secret = NULL, totp_backup = NULL, totp_last_step = 0 WHERE id = ?", [me.id]);
  return Response.json({ ok: true });
}
