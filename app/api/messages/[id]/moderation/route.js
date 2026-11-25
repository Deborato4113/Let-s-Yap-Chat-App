import pool from "@/lib/db";
import { getUserFromRequest } from "@/lib/authServer";
import { ensureSchema } from "@/lib/ensureSchema";

// A user's verdict on a flagged message:
//   POST { verdict: "false_positive" }  - "this isn't toxic"
//   POST { verdict: "correct" }         - "yes, it's harmful"
// Stored in moderation_feedback as labelled data for evaluating the classifier.
export async function POST(req, { params }) {
  const me = await getUserFromRequest(req);
  if (!me) return Response.json({ message: "Missing or invalid auth token." }, { status: 401 });
  await ensureSchema();

  const { id } = await params;
  const messageId = Number(id);
  const { verdict } = await req.json().catch(() => ({}));
  if (!Number.isInteger(messageId) || !["false_positive", "correct"].includes(verdict)) {
    return Response.json({ message: "Invalid request." }, { status: 400 });
  }

  // Only people in the message's conversation may give feedback on it.
  const [rows] = await pool.query(
    `SELECT m.toxicity_score FROM messages m
     JOIN conversation_participants cp ON cp.conversation_id = m.conversation_id AND cp.user_id = ?
     WHERE m.id = ?`,
    [me.id, messageId]
  );
  if (rows.length === 0) return Response.json({ message: "Message not found." }, { status: 404 });

  await pool.query(
    `INSERT INTO moderation_feedback (message_id, user_id, verdict, score) VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE verdict = VALUES(verdict)`,
    [messageId, me.id, verdict, rows[0].toxicity_score]
  );
  return Response.json({ ok: true });
}
