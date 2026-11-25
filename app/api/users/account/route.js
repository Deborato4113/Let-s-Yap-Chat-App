import pool from "@/lib/db";
import { getUserFromRequest } from "@/lib/authServer";
import { ensureSchema } from "@/lib/ensureSchema";

// My own account details (Settings > Account). Email is never part of the
// public user object other people receive, so it has its own endpoint.
export async function GET(req) {
  const me = await getUserFromRequest(req);
  if (!me) return Response.json({ message: "Missing or invalid auth token." }, { status: 401 });
  await ensureSchema();
  const [rows] = await pool.query(
    "SELECT username, email, created_at, (password IS NOT NULL) AS has_password, (firebase_uid IS NOT NULL) AS has_google, totp_enabled FROM users WHERE id = ?",
    [me.id]
  );
  const r = rows[0];
  if (!r) return Response.json({ message: "User not found." }, { status: 404 });
  return Response.json({
    username: r.username,
    email: r.email,
    createdAt: new Date(r.created_at).getTime(),
    hasPassword: !!r.has_password,
    twoFactor: !!r.totp_enabled,
    signIn: r.has_google && !r.has_password ? "Google" : "Email and password"
  });
}
