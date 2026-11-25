import pool from "@/lib/db";
import { getUserFromRequest } from "@/lib/authServer";
import { hiddenByBlockSql } from "@/lib/blocking";
import { ensureSchema, notExpiredSql } from "@/lib/ensureSchema";
import { emitToUser } from "@/lib/socketServer";

// Opens a view-once photo/video. The file is handed over exactly once per person:
// the second request gets 410. Once everyone else in the chat has opened it, the
// file is erased from the database.
export async function POST(req, { params }) {
  const me = await getUserFromRequest(req);
  if (!me) return Response.json({ message: "Missing or invalid auth token." }, { status: 401 });
  await ensureSchema();
  const messageId = Number((await params).id);
  if (!Number.isInteger(messageId)) return Response.json({ message: "Invalid message id." }, { status: 400 });

  const [rows] = await pool.query(
    `SELECT m.id, m.conversation_id, m.sender_id, m.type, m.file_data, m.file_name
     FROM messages m
     JOIN conversation_participants cp ON cp.conversation_id = m.conversation_id AND cp.user_id = ?
     WHERE m.id = ? AND m.view_once = 1 AND m.deleted_for_everyone = 0
       AND NOT EXISTS (SELECT 1 FROM message_deleted_for mdf WHERE mdf.message_id = m.id AND mdf.user_id = ?)
       ${hiddenByBlockSql("m")}
       ${notExpiredSql("m")}`,
    [me.id, messageId, me.id, me.id, me.id, me.id]
  );
  const m = rows[0];
  if (!m) return Response.json({ message: "That message isn't available." }, { status: 404 });
  if (String(m.sender_id) === String(me.id)) {
    return Response.json({ message: "View-once media can't be opened again by the person who sent it." }, { status: 403 });
  }
  if (!m.file_data) return Response.json({ message: "This has already been opened." }, { status: 410 });

  // the unique key makes this atomic: only the first request wins
  const [ins] = await pool.query("INSERT IGNORE INTO view_once_views (message_id, user_id) VALUES (?, ?)", [messageId, me.id]);
  if (ins.affectedRows === 0) return Response.json({ message: "You've already opened this." }, { status: 410 });

  const [[counts]] = await pool.query(
    `SELECT (SELECT COUNT(*) FROM view_once_views WHERE message_id = ?) AS views,
            (SELECT COUNT(*) FROM conversation_participants WHERE conversation_id = ? AND user_id <> ?) AS recipients`,
    [messageId, m.conversation_id, m.sender_id]
  );
  if (Number(counts.views) >= Number(counts.recipients)) {
    await pool.query("UPDATE messages SET file_data = '' WHERE id = ?", [messageId]);
  }

  const evt = { messageId: String(messageId), conversationId: String(m.conversation_id), userId: String(me.id), views: Number(counts.views) };
  emitToUser(m.sender_id, "view-once-opened", evt);
  emitToUser(me.id, "view-once-opened", evt);
  return Response.json({ type: m.type, fileData: m.file_data, fileName: m.file_name || "" });
}
