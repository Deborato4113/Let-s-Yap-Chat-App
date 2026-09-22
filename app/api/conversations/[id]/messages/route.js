import pool from "@/lib/db";
import { getUserFromRequest } from "@/lib/authServer";
import { attachReadAndDelivery, MESSAGE_SELECT_WITH_SENDER } from "@/lib/messages";

export async function GET(req, { params }) {
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

  const PAGE_SIZE = 40;
  const beforeParam = new URL(req.url).searchParams.get("before");
  const before = beforeParam ? new Date(Number(beforeParam)) : new Date(Date.now() + 1000);

  const [settingsRows] = await pool.query(
    "SELECT cleared_before FROM conversation_settings WHERE conversation_id = ? AND user_id = ?",
    [conversationId, me.id]
  );
  const clearedBefore = settingsRows[0]?.cleared_before || null;

  const [rows] = await pool.query(
    `${MESSAGE_SELECT_WITH_SENDER}
     WHERE m.conversation_id = ?
       AND m.timestamp < ?
       ${clearedBefore ? "AND m.timestamp > ?" : ""}
       AND NOT EXISTS (SELECT 1 FROM message_deleted_for mdf WHERE mdf.message_id = m.id AND mdf.user_id = ?)
     ORDER BY m.timestamp DESC
     LIMIT ?`,
    clearedBefore
      ? [conversationId, before, clearedBefore, me.id, PAGE_SIZE]
      : [conversationId, before, me.id, PAGE_SIZE]
  );

  rows.reverse();
  const hasMore = rows.length === PAGE_SIZE;
  const messages = await attachReadAndDelivery(rows);

  return Response.json({ messages, hasMore });
}
