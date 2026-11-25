import pool from "@/lib/db";
import { getUserFromRequest } from "@/lib/authServer";
import { visibleScope } from "@/lib/visibleScope";

// The attachment of one message, fetched on demand. Big photos / videos / voice notes are NOT
// included in message lists any more (that used to load every attachment of a page into memory).
export async function GET(req, { params }) {
  const me = await getUserFromRequest(req);
  if (!me) return Response.json({ message: "Missing or invalid auth token." }, { status: 401 });
  const messageId = Number((await params).id);
  if (!Number.isInteger(messageId)) return Response.json({ message: "Invalid message id." }, { status: 400 });

  const [meta] = await pool.query("SELECT conversation_id FROM messages WHERE id = ?", [messageId]);
  if (!meta[0]) return Response.json({ message: "Not found." }, { status: 404 });
  const scope = await visibleScope(me.id, meta[0].conversation_id);
  if (!scope) return Response.json({ message: "Not found." }, { status: 404 });

  const [rows] = await pool.query(
    `SELECT m.file_data FROM messages m WHERE m.id = ? AND m.view_once = 0 AND ${scope.where}`,
    [messageId, ...scope.params]
  );
  if (!rows[0]) return Response.json({ message: "Not found." }, { status: 404 });
  return Response.json({ fileData: rows[0].file_data || "" }, { headers: { "Cache-Control": "private, max-age=3600" } });
}
