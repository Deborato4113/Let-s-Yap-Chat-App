import pool from "@/lib/db";
import { getUserFromRequest } from "@/lib/authServer";
import { visibleScope } from "@/lib/visibleScope";

const MAX_MESSAGES_PER_CHAT = 50000;

// "Download all my data": profile, chats and every message I can see, as JSON.
// Photos, videos, voice notes and files are listed by name but their contents
// are left out to keep the download a sensible size.
export async function GET(req) {
  const me = await getUserFromRequest(req);
  if (!me) return Response.json({ message: "Missing or invalid auth token." }, { status: 401 });

  const [[profile]] = await pool.query(
    "SELECT username, email, name, bio, created_at FROM users WHERE id = ?",
    [me.id]
  );
  const [convos] = await pool.query(
    `SELECT c.id, c.is_group, c.group_name FROM conversations c
     JOIN conversation_participants cp ON cp.conversation_id = c.id AND cp.user_id = ?
     ORDER BY c.id`,
    [me.id]
  );

  const chats = [];
  let messageCount = 0;
  for (const c of convos) {
    const scope = await visibleScope(me.id, c.id);
    if (!scope) continue;
    const [members] = await pool.query(
      `SELECT u.username, u.name FROM conversation_participants cp JOIN users u ON u.id = cp.user_id WHERE cp.conversation_id = ?`,
      [c.id]
    );
    const [rows] = await pool.query(
      `SELECT m.id, m.type, m.text, m.file_name, m.timestamp, m.edited_at, m.pinned, u.username AS sender
       FROM messages m JOIN users u ON u.id = m.sender_id
       WHERE ${scope.where}
       ORDER BY m.timestamp ASC LIMIT ${MAX_MESSAGES_PER_CHAT}`,
      scope.params
    );
    messageCount += rows.length;
    chats.push({
      id: String(c.id),
      type: c.is_group ? "group" : "direct",
      name: c.is_group ? c.group_name : members.filter((m) => m.username !== profile.username).map((m) => m.name).join(", ") || "Chat",
      members: members.map((m) => ({ username: m.username, name: m.name })),
      messages: rows.map((r) => ({
        id: String(r.id),
        sentAt: new Date(r.timestamp).toISOString(),
        from: r.sender,
        type: r.type,
        text: r.text || "",
        ...(r.file_name ? { fileName: r.file_name } : {}),
        ...(r.edited_at ? { editedAt: new Date(r.edited_at).toISOString() } : {}),
        ...(r.pinned ? { pinned: true } : {})
      }))
    });
  }

  const [blocked] = await pool.query(
    "SELECT u.username FROM blocked_users b JOIN users u ON u.id = b.blocked_id WHERE b.blocker_id = ?",
    [me.id]
  );
  const [starred] = await pool.query("SELECT message_id FROM message_stars WHERE user_id = ?", [me.id]).catch(() => [[]]);

  const body = {
    exportedAt: new Date().toISOString(),
    note: "Photos, videos, voice notes and files are listed by file name only; their contents are not included.",
    account: {
      username: profile.username,
      email: profile.email,
      name: profile.name,
      bio: profile.bio,
      joined: new Date(profile.created_at).toISOString()
    },
    blockedUsers: blocked.map((b) => b.username),
    starredMessageIds: starred.map((s) => String(s.message_id)),
    totals: { chats: chats.length, messages: messageCount },
    chats
  };
  return new Response(JSON.stringify(body, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="lets-yap-data-${profile.username}.json"`
    }
  });
}
