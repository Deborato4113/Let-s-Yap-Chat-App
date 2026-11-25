import pool from "@/lib/db";
import { getUserFromRequest } from "@/lib/authServer";
import { loadGroupAs, parseId } from "@/lib/groupAdmin";
import { postSystemMessage, emitToParticipants, emitToUser, setRoomMembership } from "@/lib/socketServer";

async function context(req, params) {
  const me = await getUserFromRequest(req);
  if (!me) return { error: Response.json({ message: "Missing or invalid auth token." }, { status: 401 }) };
  const p = await params;
  const conversationId = parseId(p.id);
  const targetId = parseId(p.userId);
  if (!conversationId || !targetId) return { error: Response.json({ message: "Invalid id." }, { status: 400 }) };
  const ctx = await loadGroupAs(me.id, conversationId);
  if (!ctx) return { error: Response.json({ message: "Group not found." }, { status: 404 }) };
  const [target] = await pool.query(
    `SELECT u.name, cp.is_admin FROM conversation_participants cp JOIN users u ON u.id = cp.user_id
     WHERE cp.conversation_id = ? AND cp.user_id = ?`,
    [conversationId, targetId]
  );
  if (!target[0]) return { error: Response.json({ message: "That person isn't in this group." }, { status: 404 }) };
  const [[actor]] = await pool.query("SELECT name FROM users WHERE id = ?", [me.id]);
  return { me, ctx, conversationId, targetId, target: target[0], actor };
}

// Make or remove an admin.
export async function PATCH(req, { params }) {
  const c = await context(req, params);
  if (c.error) return c.error;
  if (!c.ctx.isAdmin) return Response.json({ message: "Only admins can do that." }, { status: 403 });
  const { admin } = await req.json();
  if (typeof admin !== "boolean") return Response.json({ message: "Missing admin flag." }, { status: 400 });
  if (!admin) {
    const [admins] = await pool.query("SELECT COUNT(*) AS n FROM conversation_participants WHERE conversation_id = ? AND is_admin = 1", [c.conversationId]);
    if (admins[0].n <= 1) return Response.json({ message: "A group needs at least one admin. Make someone else an admin first." }, { status: 400 });
  }
  if (!!c.target.is_admin === admin) return Response.json({ ok: true });
  await pool.query("UPDATE conversation_participants SET is_admin = ? WHERE conversation_id = ? AND user_id = ?", [admin ? 1 : 0, c.conversationId, c.targetId]);
  await postSystemMessage(
    c.conversationId,
    c.me.id,
    admin ? `${c.actor.name} made ${c.target.name} an admin.` : `${c.actor.name} removed ${c.target.name} as admin.`
  );
  await emitToParticipants(c.conversationId, "conversation-refresh", { conversationId: String(c.conversationId) });
  return Response.json({ ok: true });
}

// Remove someone (admins), or leave the group yourself (anyone).
export async function DELETE(req, { params }) {
  const c = await context(req, params);
  if (c.error) return c.error;
  const leaving = String(c.targetId) === String(c.me.id);
  if (!leaving && !c.ctx.isAdmin) return Response.json({ message: "Only admins can remove members." }, { status: 403 });

  const [before] = await pool.query("SELECT user_id FROM conversation_participants WHERE conversation_id = ?", [c.conversationId]);
  await pool.query("DELETE FROM conversation_participants WHERE conversation_id = ? AND user_id = ?", [c.conversationId, c.targetId]);
  setRoomMembership(c.targetId, c.conversationId, false);

  // If the last admin walks out, the longest-standing member takes over so the group is never admin-less.
  const [remaining] = await pool.query("SELECT user_id, is_admin FROM conversation_participants WHERE conversation_id = ? ORDER BY id", [c.conversationId]);
  if (remaining.length > 0 && !remaining.some((r) => r.is_admin)) {
    await pool.query("UPDATE conversation_participants SET is_admin = 1 WHERE conversation_id = ? AND user_id = ?", [c.conversationId, remaining[0].user_id]);
  }
  if (remaining.length > 0) {
    await postSystemMessage(
      c.conversationId,
      c.me.id,
      leaving ? `${c.target.name} left.` : `${c.actor.name} removed ${c.target.name}.`
    );
  }
  emitToUser(c.targetId, "conversation-removed", { conversationId: String(c.conversationId) });
  before.filter((r) => String(r.user_id) !== String(c.targetId)).forEach((r) =>
    emitToUser(r.user_id, "conversation-refresh", { conversationId: String(c.conversationId) })
  );
  return Response.json({ ok: true });
}
