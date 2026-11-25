import pool from "@/lib/db";
import { getUserFromRequest } from "@/lib/authServer";
import { getBlockersOf } from "@/lib/blocking";
import { loadGroupAs, parseId } from "@/lib/groupAdmin";
import { postSystemMessage, emitToParticipants, emitToUser, setRoomMembership } from "@/lib/socketServer";

const MAX_MEMBERS = 256;

// Admins add people to the group.
export async function POST(req, { params }) {
  const me = await getUserFromRequest(req);
  if (!me) return Response.json({ message: "Missing or invalid auth token." }, { status: 401 });
  const conversationId = parseId((await params).id);
  if (!conversationId) return Response.json({ message: "Invalid conversation id." }, { status: 400 });
  const ctx = await loadGroupAs(me.id, conversationId);
  if (!ctx) return Response.json({ message: "Group not found." }, { status: 404 });
  if (!ctx.isAdmin) return Response.json({ message: "Only admins can add members." }, { status: 403 });

  const { userIds } = await req.json();
  const ids = [...new Set((Array.isArray(userIds) ? userIds : []).map(parseId).filter(Boolean))];
  if (ids.length === 0) return Response.json({ message: "Pick at least one person." }, { status: 400 });

  // Anyone who has blocked me is skipped silently, like when creating a group
  const blockers = await getBlockersOf(me.id);
  const wanted = ids.filter((id) => !blockers.has(String(id)));
  const [existing] = await pool.query("SELECT user_id FROM conversation_participants WHERE conversation_id = ?", [conversationId]);
  const have = new Set(existing.map((r) => String(r.user_id)));
  const fresh = wanted.filter((id) => !have.has(String(id)));
  if (existing.length + fresh.length > MAX_MEMBERS) return Response.json({ message: `Groups can have up to ${MAX_MEMBERS} members.` }, { status: 400 });
  if (fresh.length === 0) return Response.json({ ok: true, added: 0 });

  const [users] = await pool.query("SELECT id, name FROM users WHERE id IN (?) AND is_bot = 0", [fresh]);
  if (users.length === 0) return Response.json({ ok: true, added: 0 });
  await pool.query(
    `INSERT IGNORE INTO conversation_participants (conversation_id, user_id) VALUES ${users.map(() => "(?, ?)").join(", ")}`,
    users.flatMap((u) => [conversationId, u.id])
  );
  const [[actor]] = await pool.query("SELECT name FROM users WHERE id = ?", [me.id]);
  users.forEach((u) => setRoomMembership(u.id, conversationId, true));
  await postSystemMessage(conversationId, me.id, `${actor.name} added ${users.map((u) => u.name).join(", ")}.`);
  await emitToParticipants(conversationId, "conversation-refresh", { conversationId: String(conversationId) });
  users.forEach((u) => emitToUser(u.id, "chats-refresh", {}));
  return Response.json({ ok: true, added: users.length });
}
