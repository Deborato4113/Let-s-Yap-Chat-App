import pool from "@/lib/db";
import { getUserFromRequest } from "@/lib/authServer";

// Per-user, per-conversation preferences: mute notifications and "clear chat"
// (hides everything up to now for this user only, like WhatsApp).
export async function PATCH(req, { params }) {
  const me = await getUserFromRequest(req);
  if (!me) return Response.json({ message: "Missing or invalid auth token." }, { status: 401 });

  const { id } = await params;
  const conversationId = Number(id);
  if (!Number.isInteger(conversationId)) {
    return Response.json({ message: "Invalid conversation id." }, { status: 400 });
  }

  const [membership] = await pool.query(
    "SELECT 1 FROM conversation_participants WHERE conversation_id = ? AND user_id = ? LIMIT 1",
    [conversationId, me.id]
  );
  if (membership.length === 0) {
    return Response.json({ message: "Conversation not found." }, { status: 404 });
  }

  const { muted, clearChat } = await req.json();

  await pool.query(
    `INSERT INTO conversation_settings (conversation_id, user_id, muted, cleared_before)
     VALUES (?, ?, COALESCE(?, 0), ?)
     ON DUPLICATE KEY UPDATE
       muted = COALESCE(?, muted),
       cleared_before = COALESCE(?, cleared_before)`,
    [
      conversationId,
      me.id,
      typeof muted === "boolean" ? (muted ? 1 : 0) : null,
      clearChat ? new Date() : null,
      typeof muted === "boolean" ? (muted ? 1 : 0) : null,
      clearChat ? new Date() : null
    ]
  );

  return Response.json({ ok: true });
}
