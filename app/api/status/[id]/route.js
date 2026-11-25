import pool from "@/lib/db";
import { getUserFromRequest } from "@/lib/authServer";
import { ensureSchema } from "@/lib/ensureSchema";
import { emitToUser } from "@/lib/socketServer";
import { getContactIds } from "@/lib/statusHelpers";

// The image of one status (kept out of the feed so the feed stays small).
// Only me or one of my contacts, and only while it hasn't expired.
export async function GET(req, { params }) {
  const me = await getUserFromRequest(req);
  if (!me) return Response.json({ message: "Missing or invalid auth token." }, { status: 401 });
  await ensureSchema();

  const { id } = await params;
  const [rows] = await pool.query("SELECT user_id, file_data FROM statuses WHERE id = ? AND expires_at > ?", [Number(id), new Date()]);
  const s = rows[0];
  if (!s) return Response.json({ message: "Status not found." }, { status: 404 });
  if (String(s.user_id) !== String(me.id) && !(await getContactIds(me.id)).includes(String(s.user_id))) {
    return Response.json({ message: "Status not found." }, { status: 404 });
  }
  return Response.json({ fileData: s.file_data || "" });
}

export async function DELETE(req, { params }) {
  const me = await getUserFromRequest(req);
  if (!me) return Response.json({ message: "Missing or invalid auth token." }, { status: 401 });
  await ensureSchema();

  const { id } = await params;
  const [result] = await pool.query("DELETE FROM statuses WHERE id = ? AND user_id = ?", [Number(id), me.id]);
  if (!result.affectedRows) return Response.json({ message: "Status not found." }, { status: 404 });

  try {
    (await getContactIds(me.id)).forEach((cid) => emitToUser(cid, "status-updated", { userId: String(me.id) }));
  } catch {
    /* best-effort */
  }
  return Response.json({ ok: true });
}
