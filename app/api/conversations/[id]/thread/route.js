import pool from "@/lib/db";
import { getUserFromRequest } from "@/lib/authServer";
import { hiddenByBlockSql } from "@/lib/blocking";
import { notExpiredSql } from "@/lib/ensureSchema";
import { attachReadAndDelivery, MESSAGE_SELECT_WITH_SENDER } from "@/lib/messages";

// A message plus every reply to it: GET ?messageId=123
export async function GET(req, { params }) {
  const me = await getUserFromRequest(req);
  if (!me) return Response.json({ message: "Missing or invalid auth token." }, { status: 401 });

  const { id } = await params;
  const conversationId = Number(id);
  const messageId = Number(new URL(req.url).searchParams.get("messageId"));
  if (!Number.isInteger(conversationId) || !Number.isInteger(messageId)) {
    return Response.json({ message: "Invalid request." }, { status: 400 });
  }

  const [[membership], [settingsRows]] = await Promise.all([
    pool.query("SELECT 1 FROM conversation_participants WHERE conversation_id = ? AND user_id = ? LIMIT 1", [conversationId, me.id]),
    pool.query("SELECT cleared_before FROM conversation_settings WHERE conversation_id = ? AND user_id = ?", [conversationId, me.id])
  ]);
  if (membership.length === 0) return Response.json({ message: "Conversation not found." }, { status: 404 });
  const clearedBefore = settingsRows[0]?.cleared_before || null;

  const [rows] = await pool.query(
    `${MESSAGE_SELECT_WITH_SENDER}
     WHERE m.conversation_id = ?
       AND (m.id = ? OR m.reply_to_id = ?)
       ${clearedBefore ? "AND m.timestamp > ?" : ""}
       AND NOT EXISTS (SELECT 1 FROM message_deleted_for mdf WHERE mdf.message_id = m.id AND mdf.user_id = ?)
       ${notExpiredSql("m")}
       ${hiddenByBlockSql("m")}
     ORDER BY m.timestamp ASC
     LIMIT 300`,
    [conversationId, messageId, messageId, ...(clearedBefore ? [clearedBefore] : []), me.id, me.id, me.id, me.id]
  );

  const messages = await attachReadAndDelivery(rows, me.id);
  return Response.json({
    root: messages.find((m) => m.id === String(messageId)) || null,
    replies: messages.filter((m) => m.id !== String(messageId))
  });
}
