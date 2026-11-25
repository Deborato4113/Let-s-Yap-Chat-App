import pool from "@/lib/db";
import { verifyChallenge, tooManyAttempts, recordFailure, clearFailures } from "@/lib/loginFlow";
import { issueToken } from "@/lib/sessions";
import { toPublicUser } from "@/lib/serialize";
import { verifyTotp, consumeBackupCode, parseBackup } from "@/lib/totp";

// Second step of sign-in: the 6-digit authenticator code (or a backup code).
export async function POST(req) {
  try {
    const { challenge, code } = await req.json();
    let decoded;
    try { decoded = verifyChallenge(challenge); }
    catch { return Response.json({ message: "That sign-in expired. Start again." }, { status: 401 }); }

    const key = `2fa:${decoded.id}`;
    if (tooManyAttempts(key)) {
      return Response.json({ message: "Too many wrong codes. Wait a few minutes and try again." }, { status: 429 });
    }
    const [rows] = await pool.query("SELECT * FROM users WHERE id = ? LIMIT 1", [decoded.id]);
    const user = rows[0];
    if (!user || !user.totp_enabled || !user.totp_secret) {
      return Response.json({ message: "Two-step verification is not on for this account." }, { status: 400 });
    }

    const input = String(code || "").trim();
    let ok = false;
    const step = verifyTotp(user.totp_secret, input, { lastStep: Number(user.totp_last_step) || 0 });
    if (step) {
      // conditional update stops the same code being used twice, even in parallel
      const [res] = await pool.query("UPDATE users SET totp_last_step = ? WHERE id = ? AND totp_last_step < ?", [step, user.id, step]);
      ok = res.affectedRows > 0;
    } else {
      const rest = consumeBackupCode(parseBackup(user.totp_backup), input);
      if (rest) {
        const [res] = await pool.query("UPDATE users SET totp_backup = ? WHERE id = ? AND totp_backup = ?", [JSON.stringify(rest), user.id, user.totp_backup]);
        ok = res.affectedRows > 0;
      }
    }
    if (!ok) {
      recordFailure(key);
      return Response.json({ message: "That code is not right. Check your authenticator app and try again." }, { status: 401 });
    }
    clearFailures(key);
    await pool.query("UPDATE users SET status = 'online', last_seen = NOW(3) WHERE id = ?", [user.id]);
    user.status = "online";
    const token = await issueToken(user, req);
    return Response.json({ token, user: toPublicUser(user) });
  } catch (err) {
    console.error(err);
    return Response.json({ message: "Verification failed." }, { status: 500 });
  }
}
