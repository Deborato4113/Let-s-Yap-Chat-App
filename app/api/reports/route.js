import pool from "@/lib/db";
import { getUserFromRequest } from "@/lib/authServer";
import { ensureSchema } from "@/lib/ensureSchema";

const REASONS = ["spam", "harassment", "inappropriate", "scam", "impersonation", "other"];

// Report a user and/or a specific message. (Blocking, if wanted, is a separate call.)
export async function POST(req) {
  const me = await getUserFromRequest(req);
  if (!me) return Response.json({ message: "Missing or invalid auth token." }, { status: 401 });
  const body = await req.json();
  const reason = String(body.reason || "");
  if (!REASONS.includes(reason)) return Response.json({ message: "Pick a reason." }, { status: 400 });
  const details = String(body.details || "").trim().slice(0, 500);
  let userId = body.userId ? Number(body.userId) : null;
  const conversationId = body.conversationId ? Number(body.conversationId) : null;
  const messageId = body.messageId ? Number(body.messageId) : null;
  if (!userId && !messageId) return Response.json({ message: "Nothing to report." }, { status: 400 });
  await ensureSchema();

  if (messageId) {
    const [m] = await pool.query(
      `SELECT m.sender_id, m.conversation_id FROM messages m
       JOIN conversation_participants cp ON cp.conversation_id = m.conversation_id AND cp.user_id = ?
       WHERE m.id = ?`, [me.id, messageId]);
    if (!m[0]) return Response.json({ message: "Message not found." }, { status: 404 });
    userId = Number(m[0].sender_id);
  }
  if (userId === Number(me.id)) return Response.json({ message: "You can't report yourself." }, { status: 400 });

  const [recent] = await pool.query(
    "SELECT COUNT(*) AS n FROM reports WHERE reporter_id = ? AND created_at > ?",
    [me.id, new Date(Date.now() - 3600 * 1000)]
  );
  if (recent[0].n >= 20) return Response.json({ message: "Too many reports. Try again later." }, { status: 429 });

  await pool.query(
    "INSERT INTO reports (reporter_id, reported_user_id, conversation_id, message_id, reason, details) VALUES (?, ?, ?, ?, ?, ?)",
    [me.id, userId, conversationId, messageId, reason, details]
  );
  return Response.json({ ok: true });
}
