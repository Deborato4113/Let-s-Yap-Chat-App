import bcrypt from "bcryptjs";
import pool from "@/lib/db";
import { getUserFromRequest } from "@/lib/authServer";
import { revokeAllSessions, issueToken } from "@/lib/sessions";
import { disconnectUserSockets } from "@/lib/socketServer";

// Change (or, for Google-only accounts, first set) the password.
// Other devices are signed out; this one stays signed in.
export async function POST(req) {
  try {
    const me = await getUserFromRequest(req);
    if (!me) return Response.json({ message: "Missing or invalid auth token." }, { status: 401 });
    const { currentPassword, newPassword } = await req.json();
    if (typeof newPassword !== "string" || newPassword.length < 6) {
      return Response.json({ message: "New password must be at least 6 characters." }, { status: 400 });
    }
    if (me.password) {
      const ok = await bcrypt.compare(String(currentPassword || ""), me.password);
      if (!ok) return Response.json({ message: "Your current password is not right." }, { status: 400 });
      if (currentPassword === newPassword) {
        return Response.json({ message: "Choose a password that is different from the current one." }, { status: 400 });
      }
    }
    await pool.query("UPDATE users SET password = ? WHERE id = ?", [await bcrypt.hash(newPassword, 10), me.id]);
    await revokeAllSessions(me.id);
    disconnectUserSockets(me.id);
    return Response.json({ ok: true, token: await issueToken(me, req) });
  } catch (err) {
    console.error(err);
    return Response.json({ message: "Could not change the password." }, { status: 500 });
  }
}
