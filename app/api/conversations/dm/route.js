import pool from "@/lib/db";
import { getUserFromRequest } from "@/lib/authServer";
import { buildConversationPayload } from "@/lib/conversations";

export async function POST(req) {
  const me = await getUserFromRequest(req);
  if (!me) return Response.json({ message: "Missing or invalid auth token." }, { status: 401 });

  const { userId } = await req.json();
  const targetId = Number(userId);

  if (!targetId || Number.isNaN(targetId)) {
    return Response.json({ message: "Valid userId is required." }, { status: 400 });
  }
  if (targetId === me.id) {
    return Response.json({ message: "Cannot start a conversation with yourself." }, { status: 400 });
  }

  const [peerRows] = await pool.query("SELECT id FROM users WHERE id = ?", [targetId]);
  if (peerRows.length === 0) return Response.json({ message: "User not found." }, { status: 404 });

  const [existingRows] = await pool.query(
    `SELECT c.* FROM conversations c
     WHERE c.is_group = 0
       AND EXISTS (SELECT 1 FROM conversation_participants cp1 WHERE cp1.conversation_id = c.id AND cp1.user_id = ?)
       AND EXISTS (SELECT 1 FROM conversation_participants cp2 WHERE cp2.conversation_id = c.id AND cp2.user_id = ?)
       AND (SELECT COUNT(*) FROM conversation_participants cp WHERE cp.conversation_id = c.id) = 2
     LIMIT 1`,
    [me.id, targetId]
  );

  let convoRow = existingRows[0];

  if (!convoRow) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [result] = await connection.query(
        "INSERT INTO conversations (is_group, created_by) VALUES (0, ?)",
        [me.id]
      );
      await connection.query(
        "INSERT INTO conversation_participants (conversation_id, user_id) VALUES (?, ?), (?, ?)",
        [result.insertId, me.id, result.insertId, targetId]
      );
      await connection.commit();
      const [rows] = await connection.query("SELECT * FROM conversations WHERE id = ?", [result.insertId]);
      convoRow = rows[0];
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  }

  const payload = await buildConversationPayload(convoRow, me.id);
  return Response.json(payload);
}
