import pool from "@/lib/db";
import { getUserFromRequest } from "@/lib/authServer";
import { ensureSchema } from "@/lib/ensureSchema";

const MAX_PINNED = 5;

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

  const { muted, clearChat, pinned, archived, favourite } = await req.json();

  if (typeof favourite === "boolean") {
    await ensureSchema();
    await pool.query(
      `INSERT INTO conversation_settings (conversation_id, user_id, favourite) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE favourite = ?`,
      [conversationId, me.id, favourite ? 1 : 0, favourite ? 1 : 0]
    );
    return Response.json({ ok: true, favourite });
  }

  // Archive / unarchive: moves the chat out of (or back into) my main list. Archiving also unpins.
  if (typeof archived === "boolean") {
    await ensureSchema();
    await pool.query(
      `INSERT INTO conversation_settings (conversation_id, user_id, archived) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE archived = ?${archived ? ", pinned_at = NULL" : ""}`,
      [conversationId, me.id, archived ? 1 : 0, archived ? 1 : 0]
    );
    return Response.json({ ok: true, archived, ...(archived ? { pinned: false, pinnedAt: 0 } : {}) });
  }

  // Pin / unpin this chat to the top of MY list (other people's lists are unaffected)
  if (typeof pinned === "boolean") {
    await ensureSchema();
    if (pinned) {
      const [[arch]] = await pool.query(
        "SELECT archived FROM conversation_settings WHERE conversation_id = ? AND user_id = ?",
        [conversationId, me.id]
      );
      if (arch?.archived) {
        return Response.json({ message: "Unarchive this chat before pinning it." }, { status: 400 });
      }
      const [[{ count }]] = await pool.query(
        "SELECT COUNT(*) AS count FROM conversation_settings WHERE user_id = ? AND pinned_at IS NOT NULL AND conversation_id != ?",
        [me.id, conversationId]
      );
      if (count >= MAX_PINNED) {
        return Response.json({ message: `You can pin up to ${MAX_PINNED} chats. Unpin one first.` }, { status: 400 });
      }
    }
    const pinnedAt = pinned ? new Date() : null;
    await pool.query(
      `INSERT INTO conversation_settings (conversation_id, user_id, pinned_at) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE pinned_at = ?`,
      [conversationId, me.id, pinnedAt, pinnedAt]
    );
    return Response.json({ ok: true, pinned, pinnedAt: pinnedAt ? pinnedAt.getTime() : 0 });
  }

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
