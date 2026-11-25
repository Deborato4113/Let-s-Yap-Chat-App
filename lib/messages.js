import pool from "./db.js";
import { ensureSchema } from "./ensureSchema.js";
import { hiddenByBlockSql } from "./blocking.js";

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

  await ensureSchema();
  // View-once photos/videos: who has opened them (the file itself is never in the payload)
  const viewOnceIds = rows.filter((r) => r.view_once).map((r) => r.id);
  const viewsByMessage = new Map();
  if (viewOnceIds.length > 0) {
    const [vr] = await pool.query(
      `SELECT message_id, user_id FROM view_once_views WHERE message_id IN (${viewOnceIds.map(() => "?").join(", ")})`,
      viewOnceIds
    );
    vr.forEach((v) => {
      if (!viewsByMessage.has(v.message_id)) viewsByMessage.set(v.message_id, []);
      viewsByMessage.get(v.message_id).push(String(v.user_id));
    });
  }
  const pollMap = await loadPolls(rows.filter((r) => r.type === "poll" && !r.deleted_for_everyone).map((r) => r.id));

  // How many (visible) replies each message has - drives the "N replies" chip.
  const replyCountMap = new Map();
  {
    const viewerSql = viewerId
      ? `AND NOT EXISTS (SELECT 1 FROM message_deleted_for mdf WHERE mdf.message_id = m.id AND mdf.user_id = ?) ${hiddenByBlockSql("m")}`
      : "";
    const [countRows] = await pool.query(
      `SELECT m.reply_to_id, COUNT(*) AS c FROM messages m
       WHERE m.reply_to_id IN (${placeholders}) AND m.deleted_for_everyone = 0 ${viewerSql}
       GROUP BY m.reply_to_id`,
      viewerId ? [...ids, viewerId, viewerId, viewerId, viewerId] : ids
    );
    countRows.forEach((r) => replyCountMap.set(r.reply_to_id, Number(r.c)));
  }

  return rows.map((row) =>
    serializeMessage(row, readMap.get(row.id) || [], deliveryMap.get(row.id) || [], {
      reactions: reactionMap.get(row.id) || [],
      isStarredByMe: starredSet.has(row.id),
      replyTo: row.reply_to_id ? replyToMap.get(row.reply_to_id) || null : null,
      poll: pollMap.get(row.id) || null,
      replyCount: replyCountMap.get(row.id) || 0,
      viewOnceViews: (viewsByMessage.get(row.id) || []).length,
      viewOnceOpenedByMe: !!viewerId && (viewsByMessage.get(row.id) || []).includes(String(viewerId))
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
    timestamp: new Date(row.timestamp).getTime(),
    deletedForEveryone: !!row.deleted_for_everyone
  };
}

// Polls for a batch of message ids -> Map(messageId -> poll). Votes are
// public inside the group (each option lists who picked it), like WhatsApp.
export async function loadPolls(messageIds) {
  const map = new Map();
  if (!messageIds || messageIds.length === 0) return map;
  const ph = messageIds.map(() => "?").join(", ");
  const [polls] = await pool.query(`SELECT id, message_id, question, multiple FROM polls WHERE message_id IN (${ph})`, messageIds);
  if (polls.length === 0) return map;
  const pollIds = polls.map((p) => p.id);
  const pph = pollIds.map(() => "?").join(", ");
  const [options] = await pool.query(
    `SELECT id, poll_id, text FROM poll_options WHERE poll_id IN (${pph}) ORDER BY position, id`,
    pollIds
  );
  const [votes] = await pool.query(`SELECT option_id, user_id FROM poll_votes WHERE poll_id IN (${pph})`, pollIds);
  const votersByOption = new Map();
  votes.forEach((v) => {
    if (!votersByOption.has(v.option_id)) votersByOption.set(v.option_id, []);
    votersByOption.get(v.option_id).push(String(v.user_id));
  });
  polls.forEach((p) => {
    map.set(p.message_id, {
      id: String(p.id),
      question: p.question,
      multiple: !!p.multiple,
      options: options
        .filter((o) => o.poll_id === p.id)
        .map((o) => ({ id: String(o.id), text: o.text, voters: votersByOption.get(o.id) || [] }))
    });
  });
  return map;
}

export async function fetchReplySnippets(ids) {
  const map = new Map();
  if (!ids || ids.length === 0) return map;
  const placeholders = ids.map(() => "?").join(", ");
  const [rows] = await pool.query(`${MESSAGE_SELECT_WITH_SENDER} WHERE m.id IN (${placeholders})`, ids);
  rows.forEach((row) => map.set(row.id, buildReplySnippet(row)));
  return map;
}

export function parseCall(text) {
  try {
    const c = JSON.parse(text);
    return {
      kind: c.kind === "video" ? "video" : "audio",
      status: ["completed", "missed", "declined"].includes(c.status) ? c.status : "missed",
      duration: Number(c.duration) || 0
    };
  } catch {
    return { kind: "audio", status: "missed", duration: 0 };
  }
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
    text: row.deleted_for_everyone || row.type === "call" ? "" : row.text || "",
    fileName: row.deleted_for_everyone ? "" : row.file_name || "",
    // a view-once file is never sent along with the message; it's fetched once, on open
    fileData: row.deleted_for_everyone || row.view_once ? "" : row.file_data || "",
    viewOnce: !!row.view_once,
    viewOnceViews: extra.viewOnceViews || 0,
    viewOnceOpened: !!extra.viewOnceOpenedByMe,
    forwardCount: Number(row.forward_count) || 0,
    timestamp: new Date(row.timestamp).getTime(),
    deletedForEveryone: !!row.deleted_for_everyone,
    pinned: !!row.pinned,
    flagged: !!row.flagged,
    readBy,
    deliveredTo,
    reactions: extra.reactions || [],
    isStarredByMe: !!extra.isStarredByMe,
    replyTo: extra.replyTo || null,
    editedAt: row.edited_at ? new Date(row.edited_at).getTime() : null,
    expiresAt: row.expires_at ? new Date(row.expires_at).getTime() : null,
    replyCount: extra.replyCount || 0,
    poll: extra.poll || null,
    // Call log entries (type "call") keep a small JSON blob in `text`; the
    // client gets it parsed, and `text` stays empty so it's never shown raw.
    call: row.type === "call" ? parseCall(row.text) : null
  };
}

export const MESSAGE_SELECT_WITH_SENDER = `
  SELECT m.*, u.username AS sender_username, u.name AS sender_name, u.avatar_color AS sender_avatar_color
  FROM messages m
  JOIN users u ON u.id = m.sender_id
`;
