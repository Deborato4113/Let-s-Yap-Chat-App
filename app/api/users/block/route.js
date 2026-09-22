import pool from "@/lib/db";
import { getUserFromRequest } from "@/lib/authServer";
import { emitToUser } from "@/lib/socketServer";

export async function POST(req) {
  const me = await getUserFromRequest(req);
  if (!me) return Response.json({ message: "Missing or invalid auth token." }, { status: 401 });

  const { userId, block } = await req.json();
  const targetId = Number(userId);
  if (!targetId || Number.isNaN(targetId)) {
    return Response.json({ message: "Valid userId is required." }, { status: 400 });
  }
  if (targetId === me.id) {
    return Response.json({ message: "You can't block yourself." }, { status: 400 });
  }

  if (block) {
    await pool.query(
      "INSERT IGNORE INTO blocked_users (blocker_id, blocked_id) VALUES (?, ?)",
      [me.id, targetId]
    );
  } else {
    await pool.query(
      "DELETE FROM blocked_users WHERE blocker_id = ? AND blocked_id = ?",
      [me.id, targetId]
    );
  }

  // Let the other person's open tabs know immediately, so their chat UI
  // (input disabled, "you can't message this contact" banner, etc.) updates
  // live instead of only picking this up on their next page load.
  emitToUser(targetId, "peer-block-changed", { byUserId: me.id, blocked: !!block });

  return Response.json({ ok: true, blocked: !!block });
}
