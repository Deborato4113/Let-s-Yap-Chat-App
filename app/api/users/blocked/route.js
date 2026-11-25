import pool from "@/lib/db";
import { getUserFromRequest } from "@/lib/authServer";
import { toPublicUser } from "@/lib/serialize";

// People I've blocked (Settings > Privacy > Blocked contacts). Only my own list.
export async function GET(req) {
  const me = await getUserFromRequest(req);
  if (!me) return Response.json({ message: "Missing or invalid auth token." }, { status: 401 });
  const [rows] = await pool.query(
    `SELECT u.* FROM blocked_users b JOIN users u ON u.id = b.blocked_id
     WHERE b.blocker_id = ? ORDER BY b.created_at DESC`,
    [me.id]
  );
  return Response.json({ users: rows.map(toPublicUser) });
}
