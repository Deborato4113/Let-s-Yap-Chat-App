import pool from "./db";
import { toPublicUser, toLastMessage } from "./serialize";

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
  return lastMessage.text;
}

export async function getUnreadCount(conversationId, userId) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS count FROM messages m
     WHERE m.conversation_id = ?
       AND m.sender_id != ?
       AND m.deleted_for_everyone = 0
       AND NOT EXISTS (SELECT 1 FROM message_reads mr WHERE mr.message_id = m.id AND mr.user_id = ?)`,
    [conversationId, userId, userId]
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
  const participants = await getParticipants(convoRow.id);
  const peer = convoRow.is_group ? null : participants.find((p) => String(p.id) !== String(myId));
  const lastMessage = toLastMessage(convoRow);
  const unreadCount = await getUnreadCount(convoRow.id, myId);
  const settings = await getSettings(convoRow.id, myId);

  let isBlockedByMe = false;
  let hasBlockedMe = false;
  if (peer) {
    const [blockRows] = await pool.query(
      `SELECT blocker_id, blocked_id FROM blocked_users
       WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)`,
      [myId, peer.id, peer.id, myId]
    );
    isBlockedByMe = blockRows.some((r) => String(r.blocker_id) === String(myId));
    hasBlockedMe = blockRows.some((r) => String(r.blocker_id) === String(peer.id));
  }

  return {
    id: String(convoRow.id),
    isGroup: !!convoRow.is_group,
    groupName: convoRow.group_name || "",
    groupAvatarColor: convoRow.group_avatar_color || "#00A884",
    participants,
    peer: peer || null,
    lastMessage,
    lastMessagePreview: previewText(lastMessage),
    unreadCount,
    muted: !!settings.muted,
    isBlockedByMe,
    hasBlockedMe,
    updatedAt: convoRow.updated_at
  };
}
