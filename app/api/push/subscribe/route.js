import pool from "@/lib/db";
import { getUserFromRequest } from "@/lib/authServer";
import { ensureSchema } from "@/lib/ensureSchema";

// Remembers this browser so it can be notified when the tab is closed.
export async function POST(req) {
  const me = await getUserFromRequest(req);
  if (!me) return Response.json({ message: "Missing or invalid auth token." }, { status: 401 });
  await ensureSchema();
  const { endpoint, keys } = (await req.json()) || {};
  if (typeof endpoint !== "string" || !/^https:\/\//.test(endpoint) || endpoint.length > 700 || !keys?.p256dh || !keys?.auth) {
    return Response.json({ message: "That notification subscription is not valid." }, { status: 400 });
  }
  // same browser re-subscribing (or a different person on a shared browser) just moves the row
  await pool.query(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), p256dh = VALUES(p256dh), auth = VALUES(auth)`,
    [me.id, endpoint, String(keys.p256dh).slice(0, 255), String(keys.auth).slice(0, 255)]
  );
  return Response.json({ ok: true });
}
