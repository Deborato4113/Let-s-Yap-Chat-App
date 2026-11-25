import pool from "@/lib/db";
import { getUserFromRequest } from "@/lib/authServer";
import { hiddenByBlockSql } from "@/lib/blocking";
import { notExpiredSql } from "@/lib/ensureSchema";

// Messages in this chat that @mention me (the "Mentions" filter in groups).
export async function GET(req, { params }) {
  const me = await getUserFromRequest(req);
  if (!me) return Response.json({ message: "Missing or invalid auth token." }, { status: 401 });

  const { id } = await params;
  const conversationId = Number(id);
  if (!Number.isInteger(conversationId)) return Response.json({ message: "Invalid conversation id." }, { status: 400 });

  const [[membership], [settingsRows]] = await Promise.all([
    pool.query("SELECT 1 FROM conversation_participants WHERE conversation_id = ? AND user_id = ? LIMIT 1", [conversationId, me.id]),
    pool.query("SELECT cleared_before FROM conversation_settings WHERE conversation_id = ? AND user_id = ?", [conversationId, me.id])
  ]);
  if (membership.length === 0) return Response.json({ message: "Conversation not found." }, { status: 404 });
  const clearedBefore = settingsRows[0]?.cleared_before || null;

  const username = String(me.username || "").toLowerCase();
  if (!username) return Response.json({ results: [] });
  const escaped = username.replace(/[\\%_]/g, (c) => `\\${c}`);
  const exact = new RegExp(`@${username.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![a-z0-9_])`, "i");

  const [rows] = await pool.query(
    `SELECT m.id, m.text, m.timestamp, m.sender_id, u.name AS sender_name
     FROM messages m
     JOIN users u ON u.id = m.sender_id
     WHERE m.conversation_id = ? AND m.type = 'text' AND m.deleted_for_everyone = 0
       AND m.sender_id <> ?
       AND m.text LIKE ?
       ${clearedBefore ? "AND m.timestamp > ?" : ""}
       AND NOT EXISTS (SELECT 1 FROM message_deleted_for mdf WHERE mdf.message_id = m.id AND mdf.user_id = ?)
       ${notExpiredSql("m")}
       ${hiddenByBlockSql("m")}
     ORDER BY m.timestamp DESC
     LIMIT 200`,
    [conversationId, me.id, `%@${escaped}%`, ...(clearedBefore ? [clearedBefore] : []), me.id, me.id, me.id, me.id]
  );

  return Response.json({
    results: rows
      .filter((r) => exact.test(r.text || ""))
      .map((r) => ({
        id: String(r.id),
        text: r.text || "",
        timestamp: new Date(r.timestamp).getTime(),
        senderId: String(r.sender_id),
        senderName: r.sender_name
      }))
  });
}
