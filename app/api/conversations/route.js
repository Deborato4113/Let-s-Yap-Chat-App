import pool from "@/lib/db";
import { getUserFromRequest } from "@/lib/authServer";
import { buildConversationPayload } from "@/lib/conversations";

export async function GET(req) {
  const me = await getUserFromRequest(req);
  if (!me) return Response.json({ message: "Missing or invalid auth token." }, { status: 401 });

  const [rows] = await pool.query(
    `SELECT c.* FROM conversations c
     JOIN conversation_participants cp ON cp.conversation_id = c.id
     WHERE cp.user_id = ?
     ORDER BY c.last_message_timestamp DESC, c.created_at DESC`,
    [me.id]
  );

  const results = await Promise.all(rows.map((row) => buildConversationPayload(row, me.id)));
  return Response.json(results);
}
