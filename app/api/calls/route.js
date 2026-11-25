import pool from "@/lib/db";
import { getUserFromRequest } from "@/lib/authServer";
import { hiddenByBlockSql, getBlockersOf } from "@/lib/blocking";
import { ensureSchema } from "@/lib/ensureSchema";
import { toPublicUser } from "@/lib/serialize";
import { parseCall } from "@/lib/messages";

// My call history (1:1 calls only), newest first. ?kind=audio|video filters.
// Same visibility rules as the chat itself: not cleared, not deleted for me,
// not held back by a block - so a block is never revealed through this list.
export async function GET(req) {
  const me = await getUserFromRequest(req);
  if (!me) return Response.json({ message: "Missing or invalid auth token." }, { status: 401 });
  await ensureSchema();

  const kind = new URL(req.url).searchParams.get("kind");
  const wanted = kind === "audio" || kind === "video" ? kind : null;

  const [rows] = await pool.query(
    `SELECT m.id, m.text, m.sender_id, m.conversation_id, m.timestamp,
            pu.id AS peer_id, pu.username, pu.name, pu.bio, pu.avatar_color, pu.avatar_url,
            pu.theme, pu.dark_mode, pu.status, pu.is_bot, pu.last_seen
     FROM messages m
     JOIN conversations c ON c.id = m.conversation_id AND c.is_group = 0
     JOIN conversation_participants cp ON cp.conversation_id = m.conversation_id AND cp.user_id = ?
     JOIN conversation_participants cp2 ON cp2.conversation_id = m.conversation_id AND cp2.user_id <> ?
     JOIN users pu ON pu.id = cp2.user_id
     WHERE m.type = 'call'
       AND m.deleted_for_everyone = 0
       AND NOT EXISTS (SELECT 1 FROM message_deleted_for mdf WHERE mdf.message_id = m.id AND mdf.user_id = ?)
       AND m.timestamp > COALESCE(
         (SELECT cs.cleared_before FROM conversation_settings cs WHERE cs.conversation_id = m.conversation_id AND cs.user_id = ?),
         '1970-01-02')
       ${hiddenByBlockSql("m")}
     ORDER BY m.timestamp DESC
     LIMIT 400`,
    [me.id, me.id, me.id, me.id, me.id, me.id, me.id]
  );

  const blockers = await getBlockersOf(me.id);
  const calls = [];
  for (const r of rows) {
    const call = parseCall(r.text);
    if (!call) continue;
    if (wanted && call.kind !== wanted) continue;
    const peer = toPublicUser({ ...r, id: r.peer_id });
    // someone who blocked me sees no photo / presence from me, and I see none from them either way is fine;
    // keep it the same as the chat list: hide their photo and presence from the blocked side
    if (blockers.has(String(peer.id))) {
      peer.avatarUrl = "";
      peer.lastSeen = 0;
      peer.status = "offline";
    }
    calls.push({
      id: String(r.id),
      conversationId: String(r.conversation_id),
      peer,
      direction: String(r.sender_id) === String(me.id) ? "outgoing" : "incoming",
      kind: call.kind,
      status: call.status,
      duration: call.duration || 0,
      timestamp: new Date(r.timestamp).getTime()
    });
  }
  return Response.json({ calls: calls.slice(0, 200) });
}
