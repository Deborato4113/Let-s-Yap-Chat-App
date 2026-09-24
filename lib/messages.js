import pool from "./db.js";

// Attaches sender info + readBy/deliveredTo/reactions/star/reply-quote to a
// batch of raw message rows (each row must include sender_username/sender_name/
// sender_avatar_color from a join, see MESSAGE_SELECT_WITH_SENDER).
// `viewerId` is whoever is receiving this batch - stars are private per user.
export async function attachReadAndDelivery(rows, viewerId) {
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  const placeholders = ids.map(() => "?").join(", ");

  const [readRows] = await pool.query(
    `SELECT message_id, user_id FROM message_reads WHERE message_id IN (${placeholders})`,
    ids
  );
  const [deliveryRows] = await pool.query(
    `SELECT message_id, user_id FROM message_deliveries WHERE message_id IN (${placeholders})`,
    ids
  );
  const [reactionRows] = await pool.query(
    `SELECT message_id, user_id, emoji FROM message_reactions WHERE message_id IN (${placeholders})`,
    ids
  );

  const readMap = new Map();
  readRows.forEach((r) => {
    if (!readMap.has(r.message_id)) readMap.set(r.message_id, []);
    readMap.get(r.message_id).push(String(r.user_id));
  });
  const deliveryMap = new Map();
  deliveryRows.forEach((r) => {
    if (!deliveryMap.has(r.message_id)) deliveryMap.set(r.message_id, []);
    deliveryMap.get(r.message_id).push(String(r.user_id));
  });
  const reactionMap = new Map();
  reactionRows.forEach((r) => {
    if (!reactionMap.has(r.message_id)) reactionMap.set(r.message_id, []);
    reactionMap.get(r.message_id).push({ emoji: r.emoji, userId: String(r.user_id) });
  });

  let starredSet = new Set();
  if (viewerId) {
    const [starRows] = await pool.query(
      `SELECT message_id FROM message_stars WHERE user_id = ? AND message_id IN (${placeholders})`,
      [viewerId, ...ids]
    );
    starredSet = new Set(starRows.map((r) => r.message_id));
  }

  const replyToIds = [...new Set(rows.map((r) => r.reply_to_id).filter(Boolean))];
  const replyToMap = await fetchReplySnippets(replyToIds);

  return rows.map((row) =>
    serializeMessage(row, readMap.get(row.id) || [], deliveryMap.get(row.id) || [], {
      reactions: reactionMap.get(row.id) || [],
      isStarredByMe: starredSet.has(row.id),
      replyTo: row.reply_to_id ? replyToMap.get(row.reply_to_id) || null : null
    })
  );
}

// Short quoted-message preview shown above a reply, or in "Yap AI" context.
export function buildReplySnippet(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    text: row.deleted_for_everyone ? "" : row.text || "",
    type: row.type,
    fileName: row.deleted_for_everyone ? "" : row.file_name || "",
    senderName: row.sender_name,
    deletedForEveryone: !!row.deleted_for_everyone
  };
}

export async function fetchReplySnippets(ids) {
  const map = new Map();
  if (!ids || ids.length === 0) return map;
  const placeholders = ids.map(() => "?").join(", ");
  const [rows] = await pool.query(`${MESSAGE_SELECT_WITH_SENDER} WHERE m.id IN (${placeholders})`, ids);
  rows.forEach((row) => map.set(row.id, buildReplySnippet(row)));
  return map;
}

export function serializeMessage(row, readBy = [], deliveredTo = [], extra = {}) {
  return {
    id: String(row.id),
    conversation: String(row.conversation_id),
    sender: {
      id: String(row.sender_id),
      username: row.sender_username,
      name: row.sender_name,
      avatarColor: row.sender_avatar_color
    },
    type: row.type,
    text: row.deleted_for_everyone ? "" : row.text || "",
    fileName: row.deleted_for_everyone ? "" : row.file_name || "",
    fileData: row.deleted_for_everyone ? "" : row.file_data || "",
    timestamp: new Date(row.timestamp).getTime(),
    deletedForEveryone: !!row.deleted_for_everyone,
    pinned: !!row.pinned,
    readBy,
    deliveredTo,
    reactions: extra.reactions || [],
    isStarredByMe: !!extra.isStarredByMe,
    replyTo: extra.replyTo || null
  };
}

export const MESSAGE_SELECT_WITH_SENDER = `
  SELECT m.*, u.username AS sender_username, u.name AS sender_name, u.avatar_color AS sender_avatar_color
  FROM messages m
  JOIN users u ON u.id = m.sender_id
`;
