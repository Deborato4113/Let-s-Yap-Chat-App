import pool from "@/lib/db";
import { getUserFromRequest } from "@/lib/authServer";
import { hiddenByBlockSql } from "@/lib/blocking";
import { notExpiredSql } from "@/lib/ensureSchema";

// Search text messages inside ONE conversation the caller belongs to.
export async function GET(req, { params }) {
  const me = await getUserFromRequest(req);
  if (!me) return Response.json({ message: "Missing or invalid auth token." }, { status: 401 });

  const { id } = await params;
  const conversationId = Number(id);
  if (!Number.isInteger(conversationId)) {
    return Response.json({ message: "Invalid conversation id." }, { status: 400 });
  }

  const q = (new URL(req.url).searchParams.get("q") || "").trim();
  if (q.length < 1) return Response.json({ results: [] });

  const [[membership], [settingsRows]] = await Promise.all([
    pool.query(
      "SELECT 1 FROM conversation_participants WHERE conversation_id = ? AND user_id = ? LIMIT 1",
      [conversationId, me.id]
    ),
    pool.query(
      "SELECT cleared_before FROM conversation_settings WHERE conversation_id = ? AND user_id = ?",
      [conversationId, me.id]
    )
  ]);
  if (membership.length === 0) {
    return Response.json({ message: "Conversation not found." }, { status: 404 });
  }
  const clearedBefore = settingsRows[0]?.cleared_before || null;

  // Escape LIKE wildcards so searching "50%" or "a_b" matches literally.
  const escaped = q.replace(/[\\%_]/g, (c) => `\\${c}`);

  const [rows] = await pool.query(
    `SELECT m.id, m.text, m.timestamp, m.sender_id, u.name AS sender_name
     FROM messages m
     JOIN users u ON u.id = m.sender_id
     WHERE m.conversation_id = ?
       AND m.type NOT IN ('system', 'call')
       AND m.deleted_for_everyone = 0
       AND m.text LIKE ?
       ${clearedBefore ? "AND m.timestamp > ?" : ""}
       AND NOT EXISTS (SELECT 1 FROM message_deleted_for mdf WHERE mdf.message_id = m.id AND mdf.user_id = ?)
       ${notExpiredSql("m")}
       ${hiddenByBlockSql("m")}
     ORDER BY m.timestamp DESC
     LIMIT 100`,
    clearedBefore
      ? [conversationId, `%${escaped}%`, clearedBefore, me.id, me.id, me.id, me.id]
      : [conversationId, `%${escaped}%`, me.id, me.id, me.id, me.id]
  );

  return Response.json({
    results: rows.map((r) => ({
      id: String(r.id),
      text: r.text || "",
      timestamp: new Date(r.timestamp).getTime(),
      senderId: String(r.sender_id),
      senderName: r.sender_name
    }))
  });
}
