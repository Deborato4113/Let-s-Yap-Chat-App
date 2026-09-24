import pool from "@/lib/db";
import { getUserFromRequest } from "@/lib/authServer";
import { buildConversationPayload } from "@/lib/conversations";
import { getOrCreateBotConversation, getBotUserId } from "@/lib/yapAiBot";

export async function GET(req) {
  const me = await getUserFromRequest(req);
  if (!me) return Response.json({ message: "Missing or invalid auth token." }, { status: 401 });

  // Every account gets a standing chat with Yap AI, same as Meta AI always
  // being available in WhatsApp - make sure it exists before listing.
  await getOrCreateBotConversation(me.id);

  const [rows] = await pool.query(
    `SELECT c.* FROM conversations c
     JOIN conversation_participants cp ON cp.conversation_id = c.id
     WHERE cp.user_id = ?
     ORDER BY c.last_message_timestamp DESC, c.created_at DESC`,
    [me.id]
  );

  const results = await Promise.all(rows.map((row) => buildConversationPayload(row, me.id)));

  const botId = String(await getBotUserId());
  results.sort((a, b) => {
    const aBot = a.peer && String(a.peer.id) === botId;
    const bBot = b.peer && String(b.peer.id) === botId;
    if (aBot && !bBot) return -1;
    if (bBot && !aBot) return 1;
    return 0;
  });

  return Response.json(results);
}
