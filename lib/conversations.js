import pool from "./db";
import { ensureDeletedAtColumn } from "./deletedAt.js";
import { ensureSchema, notExpiredSql } from "./ensureSchema.js";

export { ensureDeletedAtColumn };
import { toPublicUser, toLastMessage } from "./serialize";
import { hiddenByBlockSql, getBlockersOf } from "./blocking.js";

export async function getParticipants(conversationId) {
  const [rows] = await pool.query(
    `SELECT u.* FROM users u
     JOIN conversation_participants cp ON cp.user_id = u.id
     WHERE cp.conversation_id = ?`,
    [conversationId]
  );
  return rows.map(toPublicUser);
}

export function previewText(lastMessage) {
  if (!lastMessage || !lastMessage.timestamp) return "";
  if (lastMessage.type === "image") return "📷 Photo";
  if (lastMessage.type === "video") return "🎥 Video";
  if (lastMessage.type === "audio") return "🎤 Voice message";
  if (lastMessage.type === "file") return "📄 Document";
  if (lastMessage.type === "poll") return `📊 ${lastMessage.text}`;
  if (lastMessage.type === "call") {
    let c = {};
    try { c = JSON.parse(lastMessage.text); } catch { /* keep defaults */ }
    const word = c.kind === "video" ? "video call" : "voice call";
    return `${c.kind === "video" ? "🎥" : "📞"} ${c.status === "missed" ? "Missed " : ""}${word}`;
  }
  return lastMessage.text;
}

export async function getUnreadCount(conversationId, userId) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS count FROM messages m
     WHERE m.conversation_id = ?
       AND m.sender_id != ?
       AND m.deleted_for_everyone = 0
       AND m.type != 'system'
       AND m.timestamp > COALESCE((SELECT cleared_before FROM conversation_settings WHERE conversation_id = ? AND user_id = ?), '1970-01-02')
       AND NOT EXISTS (SELECT 1 FROM message_reads mr WHERE mr.message_id = m.id AND mr.user_id = ?)
       ${notExpiredSql("m")}
       ${hiddenByBlockSql("m")}`,
    [conversationId, userId, conversationId, userId, userId, userId, userId, userId]
  );
  return rows[0].count;
}

export async function getSettings(conversationId, userId) {
  const [rows] = await pool.query(
    "SELECT * FROM conversation_settings WHERE conversation_id = ? AND user_id = ?",
    [conversationId, userId]
  );
  return rows[0] || { muted: 0, cleared_before: null };
}

export async function buildConversationPayload(convoRow, myId) {
  await ensureSchema(); // makes sure conversation_settings.pinned_at exists
  // These three don't depend on each other, but used to run one after
  // another (await, await, await) - each a separate network round trip to
  // the database. Over a real network (as opposed to a DB on the same
  // machine), that round-trip latency is paid three times in a row instead
  // of once, for every single conversation in the list. Promise.all fires
  // them together so the total wait is whichever one is slowest, not the
  // sum of all three.
  const [participants, unreadCount, settings] = await Promise.all([
    getParticipants(convoRow.id),
    getUnreadCount(convoRow.id, myId),
    getSettings(convoRow.id, myId)
  ]);
  const blockers = await getBlockersOf(myId); // people who have blocked ME
  // Someone who blocked me must not see my profile picture or online status -
  // and must not be told why, so the profile simply looks like it has no photo.
  const maskedParticipants = participants.map((p) =>
    blockers.has(String(p.id)) ? { ...p, avatarUrl: "", lastSeen: 0, status: "offline" } : p
  );
  const peer = convoRow.is_group ? null : maskedParticipants.find((p) => String(p.id) !== String(myId));
  let lastMessage = toLastMessage(convoRow);
  let adminIds = [];
  if (convoRow.is_group) {
    const [adminRows] = await pool.query(
      "SELECT user_id FROM conversation_participants WHERE conversation_id = ? AND is_admin = 1",
      [convoRow.id]
    );
    adminIds = adminRows.map((r) => String(r.user_id));
  }

  let isBlockedByMe = false;
  let peerHidden = false; // peer has blocked me - UI hides their presence, nothing else changes
  if (peer) {
    const [blockRows] = await pool.query(
      `SELECT blocker_id, blocked_id FROM blocked_users
       WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)`,
      [myId, peer.id, peer.id, myId]
    );
    isBlockedByMe = blockRows.some((r) => String(r.blocker_id) === String(myId));
    peerHidden = blockRows.some((r) => String(r.blocker_id) === String(peer.id));

    // The conversation row's "last message" is global; if a block is active,
    // the newest message may be one held back from me - show the newest one
    // I'm actually allowed to see instead.
    if (blockRows.length > 0) {
      const [lastRows] = await pool.query(
        `SELECT m.text, m.type, m.sender_id, m.timestamp FROM messages m
         WHERE m.conversation_id = ? AND m.deleted_for_everyone = 0
           ${notExpiredSql("m")}
           ${hiddenByBlockSql("m")}
         ORDER BY m.timestamp DESC LIMIT 1`,
        [convoRow.id, myId, myId, myId]
      );
      lastMessage = lastRows[0]
        ? {
            text: lastRows[0].text || "",
            type: lastRows[0].type || "text",
            sender: String(lastRows[0].sender_id),
            timestamp: new Date(lastRows[0].timestamp).getTime()
          }
        : { text: "", type: "text", sender: null, timestamp: 0 };
    }
  }

  return {
    id: String(convoRow.id),
    isGroup: !!convoRow.is_group,
    groupName: convoRow.group_name || "",
    groupAvatarColor: convoRow.group_avatar_color || "#00A884",
    groupAvatarUrl: convoRow.group_avatar_url || "",
    admins: adminIds,
    onlyAdminsSend: !!convoRow.only_admins_send,
    participants: maskedParticipants,
    peer: peer || null,
    lastMessage,
    lastMessagePreview: previewText(lastMessage),
    unreadCount,
    muted: !!settings.muted,
    pinned: !!settings.pinned_at,
    pinnedAt: settings.pinned_at ? new Date(settings.pinned_at).getTime() : 0,
    archived: !!settings.archived,
    favourite: !!settings.favourite,
    disappearingSeconds: Number(convoRow.disappearing_seconds) || 0,
    isBlockedByMe,
    peerHidden,
    updatedAt: convoRow.updated_at
  };
}
