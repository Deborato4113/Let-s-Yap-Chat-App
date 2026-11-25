import pool from "@/lib/db";
import { getUserFromRequest } from "@/lib/authServer";
import { ensureDeletedAtColumn } from "@/lib/conversations";
import { ensureSchema } from "@/lib/ensureSchema";
import { postSystemMessage, emitToParticipants } from "@/lib/socketServer";

// "Delete chat" - removes the conversation from *my* list only (like
// WhatsApp). The other person must not notice anything, so for a 1:1 chat
// this does NOT remove me from the conversation: it just hides it for me and
// clears my history up to now. If either of us messages again, the same
// conversation reappears for me and the other person keeps seeing the same
// chat. (Previously the participant row was deleted, which left the other
// side with a chat whose peer showed as "Unknown" and made a brand-new
// conversation when re-added.)
// Groups still work as "leave group".
export async function DELETE(req, { params }) {
  const me = await getUserFromRequest(req);
  if (!me) return Response.json({ message: "Missing or invalid auth token." }, { status: 401 });

  const { id } = await params;
  const conversationId = Number(id);
  if (!Number.isInteger(conversationId)) {
    return Response.json({ message: "Invalid conversation id." }, { status: 400 });
  }

  const [[convo]] = await Promise.all([
    pool.query(
      `SELECT c.is_group FROM conversations c
       JOIN conversation_participants cp ON cp.conversation_id = c.id AND cp.user_id = ?
       WHERE c.id = ?`,
      [me.id, conversationId]
    ),
    ensureDeletedAtColumn()
  ]);
  if (convo.length === 0) {
    return Response.json({ message: "Conversation not found." }, { status: 404 });
  }

  if (convo[0].is_group) {
    await pool.query("DELETE FROM conversation_participants WHERE conversation_id = ? AND user_id = ?", [
      conversationId,
      me.id
    ]);
  } else {
    const now = new Date();
    await pool.query(
      `INSERT INTO conversation_settings (conversation_id, user_id, muted, cleared_before, deleted_at)
       VALUES (?, ?, 0, ?, ?)
       ON DUPLICATE KEY UPDATE cleared_before = VALUES(cleared_before), deleted_at = VALUES(deleted_at)`,
      [conversationId, me.id, now, now]
    );
  }

  return Response.json({ ok: true });
}

const TIMER_LABELS = { 86400: "24 hours", 604800: "7 days", 7776000: "90 days" };

// Turn disappearing messages on/off for the whole chat. Older messages are
// not affected; only messages sent from now on expire. Everyone in the chat
// sees a notice saying who changed it.
export async function PATCH(req, { params }) {
  const me = await getUserFromRequest(req);
  if (!me) return Response.json({ message: "Missing or invalid auth token." }, { status: 401 });

  const { id } = await params;
  const conversationId = Number(id);
  if (!Number.isInteger(conversationId)) {
    return Response.json({ message: "Invalid conversation id." }, { status: 400 });
  }
  const body = await req.json();
  const seconds = Number(body.disappearingSeconds);
  if (![0, 86400, 604800, 7776000].includes(seconds)) {
    return Response.json({ message: "Choose Off, 24 hours, 7 days or 90 days." }, { status: 400 });
  }

  await ensureSchema();
  const [rows] = await pool.query(
    `SELECT c.disappearing_seconds, u.name FROM conversations c
     JOIN conversation_participants cp ON cp.conversation_id = c.id AND cp.user_id = ?
     JOIN users u ON u.id = cp.user_id
     WHERE c.id = ?`,
    [me.id, conversationId]
  );
  if (rows.length === 0) return Response.json({ message: "Conversation not found." }, { status: 404 });
  if (Number(rows[0].disappearing_seconds) === seconds) {
    return Response.json({ ok: true, disappearingSeconds: seconds });
  }

  await pool.query("UPDATE conversations SET disappearing_seconds = ? WHERE id = ?", [seconds, conversationId]);
  await postSystemMessage(
    conversationId,
    me.id,
    seconds === 0
      ? `${rows[0].name} turned off disappearing messages.`
      : `${rows[0].name} turned on disappearing messages. New messages will disappear after ${TIMER_LABELS[seconds]}.`
  );
  await emitToParticipants(conversationId, "conversation-updated", {
    conversationId: String(conversationId),
    disappearingSeconds: seconds
  });
  return Response.json({ ok: true, disappearingSeconds: seconds });
}
