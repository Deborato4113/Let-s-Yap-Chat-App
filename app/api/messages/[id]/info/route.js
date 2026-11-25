import pool from "@/lib/db";
import { getUserFromRequest } from "@/lib/authServer";
import { ensureSchema } from "@/lib/ensureSchema";

// "Message info": who has read / received one of MY messages (works for groups).
export async function GET(req, { params }) {
  const me = await getUserFromRequest(req);
  if (!me) return Response.json({ message: "Missing or invalid auth token." }, { status: 401 });
  const { id } = await params;
  const messageId = Number(id);
  if (!Number.isInteger(messageId)) return Response.json({ message: "Invalid message id." }, { status: 400 });
  await ensureSchema();

  const [msgs] = await pool.query("SELECT id, conversation_id, sender_id FROM messages WHERE id = ?", [messageId]);
  const msg = msgs[0];
  if (!msg || Number(msg.sender_id) !== Number(me.id)) {
    return Response.json({ message: "Only the sender can see message info." }, { status: 403 });
  }
  const [members] = await pool.query(
    `SELECT u.id, u.name, u.avatar_color, u.avatar_url,
            (SELECT 1 FROM message_reads mr WHERE mr.message_id = ? AND mr.user_id = u.id LIMIT 1) AS is_read,
            (SELECT 1 FROM message_deliveries md WHERE md.message_id = ? AND md.user_id = u.id LIMIT 1) AS is_delivered
     FROM conversation_participants cp JOIN users u ON u.id = cp.user_id
     WHERE cp.conversation_id = ? AND u.id != ? AND u.is_bot = 0`,
    [messageId, messageId, msg.conversation_id, me.id]
  );
  const shape = (u) => ({ id: String(u.id), name: u.name, avatarColor: u.avatar_color, avatarUrl: u.avatar_url || "" });
  return Response.json({
    readBy: members.filter((u) => u.is_read).map(shape),
    deliveredTo: members.filter((u) => !u.is_read && u.is_delivered).map(shape),
    pending: members.filter((u) => !u.is_read && !u.is_delivered).map(shape)
  });
}
