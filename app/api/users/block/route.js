import pool from "@/lib/db";
import { getUserFromRequest } from "@/lib/authServer";
import { emitToUser } from "@/lib/socketServer";

export async function POST(req) {
  const me = await getUserFromRequest(req);
  if (!me) return Response.json({ message: "Missing or invalid auth token." }, { status: 401 });

  const { userId, block } = await req.json();
  const targetId = Number(userId);
  if (!targetId || Number.isNaN(targetId)) {
    return Response.json({ message: "Valid userId is required." }, { status: 400 });
  }
  if (targetId === me.id) {
    return Response.json({ message: "You can't block yourself." }, { status: 400 });
  }

  if (block) {
    await pool.query(
      "INSERT IGNORE INTO blocked_users (blocker_id, blocked_id) VALUES (?, ?)",
      [me.id, targetId]
    );
  } else {
    await pool.query(
      "DELETE FROM blocked_users WHERE blocker_id = ? AND blocked_id = ?",
      [me.id, targetId]
    );
  }

  // Blocking is silent: the other person is never told. The only thing sent
  // to them is a neutral "refresh your chat list" nudge so that their view of
  // my profile picture / online status updates live (it carries no hint of
  // why). On unblock, also mark the messages that were held back during the
  // block as delivered both ways, then nudge both sides to reload them.
  if (!block) {
    try {
      await pool.query(
        `INSERT IGNORE INTO message_deliveries (message_id, user_id)
         SELECT m.id, ? FROM messages m
         JOIN conversations c ON c.id = m.conversation_id AND c.is_group = 0
         JOIN conversation_participants cp1 ON cp1.conversation_id = c.id AND cp1.user_id = ?
         JOIN conversation_participants cp2 ON cp2.conversation_id = c.id AND cp2.user_id = ?
         WHERE m.sender_id = ?`,
        [me.id, me.id, targetId, targetId]
      );
      await pool.query(
        `INSERT IGNORE INTO message_deliveries (message_id, user_id)
         SELECT m.id, ? FROM messages m
         JOIN conversations c ON c.id = m.conversation_id AND c.is_group = 0
         JOIN conversation_participants cp1 ON cp1.conversation_id = c.id AND cp1.user_id = ?
         JOIN conversation_participants cp2 ON cp2.conversation_id = c.id AND cp2.user_id = ?
         WHERE m.sender_id = ?`,
        [targetId, me.id, targetId, me.id]
      );
    } catch (err) {
      console.error("Failed to mark held-back messages delivered:", err.message);
    }
  }
  emitToUser(targetId, "chats-refresh", {});
  emitToUser(me.id, "chats-refresh", {});

  return Response.json({ ok: true, blocked: !!block });
}
