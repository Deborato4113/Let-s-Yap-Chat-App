import pool from "@/lib/db";
import { getUserFromRequest } from "@/lib/authServer";

// "Delete chat" - removes the conversation from *my* list only (like
// WhatsApp: the other participant keeps their copy). If it's a DM and we
// message that person again later, a fresh conversation is started.
export async function DELETE(req, { params }) {
  const me = await getUserFromRequest(req);
  if (!me) return Response.json({ message: "Missing or invalid auth token." }, { status: 401 });

  const { id } = await params;
  const conversationId = Number(id);
  if (!Number.isInteger(conversationId)) {
    return Response.json({ message: "Invalid conversation id." }, { status: 400 });
  }

  const [result] = await pool.query(
    "DELETE FROM conversation_participants WHERE conversation_id = ? AND user_id = ?",
    [conversationId, me.id]
  );
  if (result.affectedRows === 0) {
    return Response.json({ message: "Conversation not found." }, { status: 404 });
  }

  return Response.json({ ok: true });
}
