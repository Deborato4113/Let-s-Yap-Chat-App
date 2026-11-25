import pool from "@/lib/db";
import { getUserFromRequest } from "@/lib/authServer";
import { hiddenByBlockSql } from "@/lib/blocking";
import { notExpiredSql } from "@/lib/ensureSchema";

// Every message I've starred, across all my chats, newest first. Only
// messages I can still see in the chat itself are returned (not deleted,
// not cleared, not held back by a block).
export async function GET(req) {
  const me = await getUserFromRequest(req);
  if (!me) return Response.json({ message: "Missing or invalid auth token." }, { status: 401 });

  const [rows] = await pool.query(
    `SELECT m.id, m.text, m.type, m.file_name, m.timestamp, m.sender_id, m.conversation_id,
            u.name AS sender_name, c.is_group, c.group_name,
            (SELECT u2.name FROM conversation_participants cp2
               JOIN users u2 ON u2.id = cp2.user_id
              WHERE cp2.conversation_id = m.conversation_id AND cp2.user_id <> ? LIMIT 1) AS peer_name
     FROM message_stars ms
     JOIN messages m ON m.id = ms.message_id
     JOIN users u ON u.id = m.sender_id
     JOIN conversations c ON c.id = m.conversation_id
     WHERE ms.user_id = ?
       AND m.deleted_for_everyone = 0
       AND EXISTS (SELECT 1 FROM conversation_participants cp WHERE cp.conversation_id = m.conversation_id AND cp.user_id = ?)
       AND NOT EXISTS (SELECT 1 FROM message_deleted_for mdf WHERE mdf.message_id = m.id AND mdf.user_id = ?)
       AND m.timestamp > COALESCE(
         (SELECT cs.cleared_before FROM conversation_settings cs WHERE cs.conversation_id = m.conversation_id AND cs.user_id = ?),
         '1970-01-02')
       ${notExpiredSql("m")}
       ${hiddenByBlockSql("m")}
     ORDER BY m.timestamp DESC
     LIMIT 200`,
    [me.id, me.id, me.id, me.id, me.id, me.id, me.id, me.id]
  );

  return Response.json({
    starred: rows.map((r) => ({
      id: String(r.id),
      conversationId: String(r.conversation_id),
      conversationName: r.is_group ? r.group_name : r.peer_name || "Chat",
      isGroup: !!r.is_group,
      senderId: String(r.sender_id),
      senderName: r.sender_name,
      type: r.type,
      text: r.type === "call" ? "" : r.text || "",
      fileName: r.file_name || "",
      timestamp: new Date(r.timestamp).getTime()
    }))
  });
}
