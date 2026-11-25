import pool from "@/lib/db";
import { getUserFromRequest } from "@/lib/authServer";
import { hiddenByBlockSql } from "@/lib/blocking";
import { notExpiredSql } from "@/lib/ensureSchema";
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

  // `since` (ms): return EVERYTHING from that time up to `before` (capped),
  // instead of one 40-message page - used to jump to an old search result.
  const sinceParam = new URL(req.url).searchParams.get("since");
  const since = sinceParam ? new Date(Number(sinceParam)) : null;
  const PAGE_SIZE = since ? 1000 : 40;
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
       ${since ? "AND m.timestamp >= ?" : ""}
       AND NOT EXISTS (SELECT 1 FROM message_deleted_for mdf WHERE mdf.message_id = m.id AND mdf.user_id = ?)
       ${notExpiredSql("m")}
       ${hiddenByBlockSql("m")}
     ORDER BY m.timestamp DESC
     LIMIT ?`,
    [conversationId, before, ...(clearedBefore ? [clearedBefore] : []), ...(since ? [since] : []), me.id, me.id, me.id, me.id, PAGE_SIZE]
  );

  rows.reverse();
  // With `since`, assume older history may still exist (client keeps paging).
  const hasMore = since ? true : rows.length === PAGE_SIZE;
  const messages = await attachReadAndDelivery(rows, me.id);

  return Response.json({ messages, hasMore });
}
