import pool from "@/lib/db";
import { getUserFromRequest } from "@/lib/authServer";
import { ensureSchema } from "@/lib/ensureSchema";
import { verifyTotp, generateBackupCodes } from "@/lib/totp";
import { tooManyAttempts, recordFailure, clearFailures } from "@/lib/loginFlow";

// Step 2: prove the app works by typing the current code. Backup codes are shown once.
export async function POST(req) {
  const me = await getUserFromRequest(req);
  if (!me) return Response.json({ message: "Missing or invalid auth token." }, { status: 401 });
  await ensureSchema();
  const { code } = await req.json();
  if (me.totp_enabled) return Response.json({ message: "Two-step verification is already on." }, { status: 400 });
  if (!me.totp_secret) return Response.json({ message: "Start setup first." }, { status: 400 });
  const key = `2fa-enable:${me.id}`;
  if (tooManyAttempts(key)) return Response.json({ message: "Too many wrong codes. Wait a few minutes and try again." }, { status: 429 });
  const step = verifyTotp(me.totp_secret, code);
  if (!step) {
    recordFailure(key);
    return Response.json({ message: "That code is not right. Check your authenticator app and try again." }, { status: 400 });
  }
  clearFailures(key);
  const { plain, hashed } = generateBackupCodes(8);
  await pool.query("UPDATE users SET totp_enabled = 1, totp_backup = ?, totp_last_step = ? WHERE id = ?", [JSON.stringify(hashed), step, me.id]);
  return Response.json({ ok: true, backupCodes: plain });
}
