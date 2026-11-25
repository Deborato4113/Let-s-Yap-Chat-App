import pool from "@/lib/db";
import { getUserFromRequest } from "@/lib/authServer";
import { ensureSchema } from "@/lib/ensureSchema";
import { getContactIds } from "@/lib/statusHelpers";

// I viewed a contact's status.
export async function POST(req, { params }) {
  const me = await getUserFromRequest(req);
  if (!me) return Response.json({ message: "Missing or invalid auth token." }, { status: 401 });
  await ensureSchema();

  const { id } = await params;
  const [rows] = await pool.query("SELECT user_id FROM statuses WHERE id = ? AND expires_at > ?", [Number(id), new Date()]);
  const s = rows[0];
  if (!s || String(s.user_id) === String(me.id)) return Response.json({ ok: true });
  if (!(await getContactIds(me.id)).includes(String(s.user_id))) {
    return Response.json({ message: "Status not found." }, { status: 404 });
  }
  await pool.query("INSERT IGNORE INTO status_views (status_id, viewer_id) VALUES (?, ?)", [Number(id), me.id]);
  return Response.json({ ok: true });
}

// Who viewed my status (owner only).
export async function GET(req, { params }) {
  const me = await getUserFromRequest(req);
  if (!me) return Response.json({ message: "Missing or invalid auth token." }, { status: 401 });
  await ensureSchema();

  const { id } = await params;
  const [own] = await pool.query("SELECT 1 FROM statuses WHERE id = ? AND user_id = ?", [Number(id), me.id]);
  if (own.length === 0) return Response.json({ message: "Status not found." }, { status: 404 });

  const [rows] = await pool.query(
    `SELECT u.id, u.name, u.avatar_color, u.avatar_url, v.viewed_at
     FROM status_views v JOIN users u ON u.id = v.viewer_id
     WHERE v.status_id = ? ORDER BY v.viewed_at DESC`,
    [Number(id)]
  );
  return Response.json({
    viewers: rows.map((r) => ({
      id: String(r.id),
      name: r.name,
      avatarColor: r.avatar_color,
      avatarUrl: r.avatar_url || "",
      viewedAt: new Date(r.viewed_at).getTime()
    }))
  });
}
