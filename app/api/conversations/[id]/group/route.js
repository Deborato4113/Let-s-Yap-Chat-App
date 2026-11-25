import pool from "@/lib/db";
import { getUserFromRequest } from "@/lib/authServer";
import { loadGroupAs, parseId } from "@/lib/groupAdmin";
import { postSystemMessage, emitToParticipants } from "@/lib/socketServer";

const MAX_AVATAR = 400 * 1024; // the browser shrinks photos first; this is a safety cap

// Edit group details. Only admins can change the name, photo or who may send.
export async function PATCH(req, { params }) {
  const me = await getUserFromRequest(req);
  if (!me) return Response.json({ message: "Missing or invalid auth token." }, { status: 401 });
  const conversationId = parseId((await params).id);
  if (!conversationId) return Response.json({ message: "Invalid conversation id." }, { status: 400 });
  const ctx = await loadGroupAs(me.id, conversationId);
  if (!ctx) return Response.json({ message: "Group not found." }, { status: 404 });
  if (!ctx.isAdmin) return Response.json({ message: "Only admins can change group settings." }, { status: 403 });

  const body = await req.json();
  const sets = [];
  const values = [];
  const notices = [];
  const [[actor]] = await pool.query("SELECT name FROM users WHERE id = ?", [me.id]);

  if (typeof body.name === "string") {
    const name = body.name.trim().slice(0, 60);
    if (!name) return Response.json({ message: "Group name can't be empty." }, { status: 400 });
    if (name !== ctx.group.group_name) {
      sets.push("group_name = ?");
      values.push(name);
      notices.push(`${actor.name} changed the group name to "${name}".`);
    }
  }
  if (typeof body.avatarUrl === "string") {
    if (body.avatarUrl.length > MAX_AVATAR) return Response.json({ message: "That photo is too large." }, { status: 400 });
    if (body.avatarUrl && !body.avatarUrl.startsWith("data:image/")) {
      return Response.json({ message: "Choose an image." }, { status: 400 });
    }
    sets.push("group_avatar_url = ?");
    values.push(body.avatarUrl || null);
    notices.push(body.avatarUrl ? `${actor.name} changed the group photo.` : `${actor.name} removed the group photo.`);
  }
  if (typeof body.onlyAdminsSend === "boolean" && body.onlyAdminsSend !== !!ctx.group.only_admins_send) {
    sets.push("only_admins_send = ?");
    values.push(body.onlyAdminsSend ? 1 : 0);
    notices.push(
      body.onlyAdminsSend ? `${actor.name} made this group admins-only. Only admins can send messages.` : `${actor.name} allowed all members to send messages.`
    );
  }
  if (sets.length === 0) return Response.json({ ok: true });

  await pool.query(`UPDATE conversations SET ${sets.join(", ")} WHERE id = ?`, [...values, conversationId]);
  for (const text of notices) await postSystemMessage(conversationId, me.id, text);
  await emitToParticipants(conversationId, "conversation-refresh", { conversationId: String(conversationId) });
  return Response.json({ ok: true });
}
