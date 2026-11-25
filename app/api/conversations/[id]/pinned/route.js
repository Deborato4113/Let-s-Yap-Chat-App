import pool from "@/lib/db";
import { getUserFromRequest } from "@/lib/authServer";
import { visibleScope } from "@/lib/visibleScope";

// All pinned messages in a chat, newest first (for the pinned-messages list).
export async function GET(req, { params }) {
  const me = await getUserFromRequest(req);
  if (!me) return Response.json({ message: "Missing or invalid auth token." }, { status: 401 });
  const conversationId = Number((await params).id);
  if (!Number.isInteger(conversationId)) return Response.json({ message: "Invalid conversation id." }, { status: 400 });
  const scope = await visibleScope(me.id, conversationId);
  if (!scope) return Response.json({ message: "Conversation not found." }, { status: 404 });

  const [rows] = await pool.query(
    `SELECT m.id, m.type, m.text, m.file_name, m.timestamp, m.sender_id, u.name AS sender_name
     FROM messages m JOIN users u ON u.id = m.sender_id
     WHERE ${scope.where} AND m.pinned = 1
     ORDER BY m.timestamp DESC LIMIT 100`,
    scope.params
  );
  return Response.json({
    items: rows.map((r) => ({
      id: String(r.id),
      type: r.type,
      text: r.text || "",
      fileName: r.file_name || "",
      timestamp: new Date(r.timestamp).getTime(),
      senderId: String(r.sender_id),
      senderName: r.sender_name
    }))
  });
}
