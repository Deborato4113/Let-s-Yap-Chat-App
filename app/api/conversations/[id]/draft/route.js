import pool from "@/lib/db";
import { getUserFromRequest } from "@/lib/authServer";
import { ensureSchema } from "@/lib/ensureSchema";
import { emitToUser } from "@/lib/socketServer";

// Saves (or clears, when text is empty) my draft for this chat and tells my other devices.
export async function PUT(req, { params }) {
  const me = await getUserFromRequest(req);
  if (!me) return Response.json({ message: "Missing or invalid auth token." }, { status: 401 });
  await ensureSchema();
  const conversationId = Number((await params).id);
  if (!Number.isInteger(conversationId)) return Response.json({ message: "Invalid conversation id." }, { status: 400 });
  const [member] = await pool.query("SELECT 1 FROM conversation_participants WHERE conversation_id = ? AND user_id = ? LIMIT 1", [conversationId, me.id]);
  if (member.length === 0) return Response.json({ message: "Conversation not found." }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const text = String(body.text ?? "").slice(0, 10000);
  if (text.trim() === "") {
    await pool.query("DELETE FROM drafts WHERE user_id = ? AND conversation_id = ?", [me.id, conversationId]);
  } else {
    await pool.query(
      `INSERT INTO drafts (user_id, conversation_id, text, updated_at) VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE text = VALUES(text), updated_at = VALUES(updated_at)`,
      [me.id, conversationId, text, new Date()]
    );
  }
  emitToUser(me.id, "draft-updated", { conversationId: String(conversationId), text: text.trim() === "" ? "" : text });
  return Response.json({ ok: true });
}
