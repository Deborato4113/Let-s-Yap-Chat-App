import pool from "@/lib/db";
import { getUserFromRequest } from "@/lib/authServer";
import { ensureSchema } from "@/lib/ensureSchema";

const MAX_PENDING = 50;

async function isMember(conversationId, userId) {
  const [rows] = await pool.query(
    "SELECT 1 FROM conversation_participants WHERE conversation_id = ? AND user_id = ? LIMIT 1",
    [conversationId, userId]
  );
  return rows.length > 0;
}

// My pending scheduled messages in one conversation.
export async function GET(req) {
  const me = await getUserFromRequest(req);
  if (!me) return Response.json({ message: "Missing or invalid auth token." }, { status: 401 });
  await ensureSchema();

  const conversationId = Number(new URL(req.url).searchParams.get("conversationId"));
  if (!Number.isInteger(conversationId)) return Response.json({ message: "conversationId is required." }, { status: 400 });
  if (!(await isMember(conversationId, me.id))) return Response.json({ message: "Conversation not found." }, { status: 404 });

  const [rows] = await pool.query(
    `SELECT id, text, send_at FROM scheduled_messages
     WHERE conversation_id = ? AND sender_id = ? AND status = 'pending' ORDER BY send_at`,
    [conversationId, me.id]
  );
  return Response.json({
    scheduled: rows.map((r) => ({ id: String(r.id), text: r.text, sendAt: new Date(r.send_at).getTime() }))
  });
}

// Schedule a text message: { conversationId, text, sendAt (ms) }
export async function POST(req) {
  const me = await getUserFromRequest(req);
  if (!me) return Response.json({ message: "Missing or invalid auth token." }, { status: 401 });
  await ensureSchema();

  const body = await req.json().catch(() => ({}));
  const conversationId = Number(body.conversationId);
  const text = String(body.text || "").trim().slice(0, 10000);
  const sendAt = Number(body.sendAt);

  if (!Number.isInteger(conversationId)) return Response.json({ message: "conversationId is required." }, { status: 400 });
  if (!text) return Response.json({ message: "Type a message to schedule." }, { status: 400 });
  if (!Number.isFinite(sendAt) || sendAt < Date.now() + 10 * 1000) {
    return Response.json({ message: "Pick a time in the future." }, { status: 400 });
  }
  if (sendAt > Date.now() + 365 * 24 * 60 * 60 * 1000) {
    return Response.json({ message: "You can schedule up to a year ahead." }, { status: 400 });
  }
  if (!(await isMember(conversationId, me.id))) return Response.json({ message: "Conversation not found." }, { status: 404 });

  const [[{ n }]] = await pool.query(
    "SELECT COUNT(*) AS n FROM scheduled_messages WHERE sender_id = ? AND status = 'pending'",
    [me.id]
  );
  if (n >= MAX_PENDING) {
    return Response.json({ message: `You can have up to ${MAX_PENDING} scheduled messages.` }, { status: 400 });
  }

  const [result] = await pool.query(
    "INSERT INTO scheduled_messages (conversation_id, sender_id, text, send_at) VALUES (?, ?, ?, ?)",
    [conversationId, me.id, text, new Date(sendAt)]
  );
  return Response.json({ scheduled: { id: String(result.insertId), text, sendAt } }, { status: 201 });
}
