import { USER_COLS, userAvatarFromRow } from "./avatars.js";
import { verifyToken } from "./jwt.js";
import pool from "./db.js";
import { ensureDeletedAtColumn } from "./deletedAt.js";
import { isBlockedEitherWay, isBlockedDm, hiddenByBlockSql } from "./blocking.js";
import { serializeMessage, buildReplySnippet, loadPolls } from "./messages.js";
import { ensureSchema } from "./ensureSchema.js";
import { sessionIsValid } from "./sessions.js";
import { pushToUser } from "./webPush.js";
import { getBotUserId } from "./yapAiBot.js";
import { moderateMessage } from "./moderation.js";
import { getAiReply } from "./ai.js";
import { looksLikeSearchQuery, searchWeb, formatSearchContext } from "./webSearch.js";

// Next.js dev (and prod) loads this file as a SEPARATE module instance for
// server.js (plain Node ESM import) vs. for anything under app/api (bundled
// by Next's own compiler). Module-scoped variables don't survive that split -
// registerSocket() would set them in one copy while an API route reads a
// second, still-uninitialized copy. globalThis is the one thing guaranteed
// to be shared across both, so the live socket.io instance and the
// socket.id/userId bookkeeping live there instead.
//
// socket.id -> userId, userId -> Set(socket.id)  (supports multiple tabs/devices)
const onlineUsers = globalThis.__yapOnlineUsers || (globalThis.__yapOnlineUsers = new Map());

function getIo() {
  return globalThis.__yapIo || null;
}

function emitToUser(userId, event, payload) {
  const io = getIo();
  if (!io) return false;
  const set = onlineUsers.get(String(userId));
  if (!set) return false;
  set.forEach((sockId) => io.to(sockId).emit(event, payload));
  return set.size > 0;
}

// Sends an event to every participant of a conversation who is online
// (by user, so it also reaches people who haven't joined the room yet).
async function emitToParticipants(conversationId, event, payload) {
  const [rows] = await pool.query("SELECT user_id FROM conversation_participants WHERE conversation_id = ?", [conversationId]);
  rows.forEach(({ user_id }) => emitToUser(user_id, event, payload));
}

// Keep live sockets' rooms in step with group membership changes.
function setRoomMembership(userId, conversationId, joined) {
  const io = getIo();
  const set = onlineUsers.get(String(userId));
  if (!io || !set) return;
  set.forEach((sockId) => {
    const sock = io.sockets.sockets.get(sockId);
    if (!sock) return;
    if (joined) sock.join(String(conversationId));
    else sock.leave(String(conversationId));
  });
}

// Kick a user's live connections after their sessions were revoked.
// keepSid: leave the socket that belongs to that session alone.
function disconnectUserSockets(userId, keepSid = null, onlySid = null) {
  const io = getIo();
  const set = onlineUsers.get(String(userId));
  if (!io || !set) return;
  [...set].forEach((sockId) => {
    const sock = io.sockets.sockets.get(sockId);
    if (!sock) return;
    if (onlySid ? sock.sid === onlySid : (!keepSid || sock.sid !== keepSid)) sock.disconnect(true);
  });
}

export { emitToUser, emitToParticipants, setRoomMembership, disconnectUserSockets };

// When the chat has disappearing messages on, a new message gets an expiry time.
async function expiryFor(conversationId, now) {
  const [rows] = await pool.query("SELECT disappearing_seconds FROM conversations WHERE id = ?", [conversationId]);
  const seconds = Number(rows[0]?.disappearing_seconds) || 0;
  return seconds > 0 ? new Date(now.getTime() + seconds * 1000) : null;
}

// Inserts a message from the Yap AI bot (text or generated image), updates
// the conversation preview, and broadcasts it - shared by both reply modes
// below so they don't duplicate the bookkeeping.
async function insertBotMessage(conversationId, botId, humanUserId, { type = "text", text = "", fileName = "", fileData = "" }) {
  const io = getIo();
  const now = new Date();
  const expiresAt = await expiryFor(conversationId, now);
  const [result] = await pool.query(
    `INSERT INTO messages (conversation_id, sender_id, type, text, file_name, file_data, timestamp, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [conversationId, botId, type, text, fileName, fileData, now, expiresAt]
  );
  const messageId = result.insertId;
  await pool.query("INSERT IGNORE INTO message_deliveries (message_id, user_id) VALUES (?, ?)", [messageId, botId]);
  await pool.query("INSERT IGNORE INTO message_reads (message_id, user_id) VALUES (?, ?)", [messageId, botId]);

  await pool.query(
    `UPDATE conversations
     SET last_message_text = ?, last_message_type = ?, last_message_sender_id = ?, last_message_timestamp = ?
     WHERE id = ?`,
    [text, type, botId, now, conversationId]
  );

  const [msgRows] = await pool.query(`${MESSAGE_SELECT_WITH_SENDER} WHERE m.id = ?`, [messageId]);
  const message = serializeMessage(msgRows[0], [], [], {});

  if (io) io.to(String(conversationId)).emit("new-message", message);
  emitToUser(String(humanUserId), "conversation-preview", {
    conversationId: String(conversationId),
    lastMessage: { text, type, sender: botId, timestamp: message.timestamp }
  });
  return message;
}

// If the conversation is the person's standing chat with the Yap AI bot,
// generate and send its reply in the background - fire-and-forget from the
// send-message handler, same as how a real person would take a few seconds
// to type back. Errors are swallowed here so a bad AI call never breaks the
// human's own message from going through.
async function maybeReplyAsYapAi(conversationId, humanUserId) {
  const io = getIo();
  if (!io) return;

  const botId = await getBotUserId();
  const [participants] = await pool.query(
    "SELECT user_id FROM conversation_participants WHERE conversation_id = ?",
    [conversationId]
  );
  if (!participants.some((p) => String(p.user_id) === String(botId))) return;

  io.to(String(conversationId)).emit("typing", {
    conversationId,
    userId: String(botId),
    name: "Yap AI",
    isTyping: true
  });

  try {
    const [rows] = await pool.query(
      `${MESSAGE_SELECT_WITH_SENDER}
       WHERE m.conversation_id = ? AND m.deleted_for_everyone = 0
       ORDER BY m.timestamp DESC
       LIMIT 20`,
      [conversationId]
    );
    rows.reverse();
    const history = rows
      .map((r) => ({
        role: String(r.sender_id) === String(botId) ? "assistant" : "user",
        text: r.text || (r.type !== "text" ? `[sent a ${r.type}]` : "")
      }))
      .filter((m) => m.text);
    if (history.length === 0) return;

    const lastUserMsg = [...history].reverse().find((m) => m.role === "user");

    let searchContext = null;
    if (lastUserMsg && looksLikeSearchQuery(lastUserMsg.text)) {
      const results = await searchWeb(lastUserMsg.text);
      searchContext = formatSearchContext(results);
    }

    const replyText = await getAiReply(history, searchContext);
    await insertBotMessage(conversationId, botId, humanUserId, { type: "text", text: replyText });
  } catch (err) {
    console.error("Yap AI bot reply failed:", err);
  } finally {
    io.to(String(conversationId)).emit("typing", {
      conversationId,
      userId: String(botId),
      name: "Yap AI",
      isTyping: false
    });
  }
}

const MESSAGE_SELECT_WITH_SENDER = `
  SELECT m.id, m.conversation_id, m.sender_id, m.type, m.text, m.file_name,
         IF(LENGTH(m.file_data) <= 150000, m.file_data, '') AS file_data, LENGTH(m.file_data) AS file_size,
         m.timestamp, m.deleted_for_everyone, m.reply_to_id, m.pinned, m.created_at, m.expires_at, m.toxicity_score,
         m.flagged, m.edited_at, m.transcript, m.view_once, m.forward_count,
         u.username AS sender_username, u.name AS sender_name, u.avatar_color AS sender_avatar_color
  FROM messages m
  JOIN users u ON u.id = m.sender_id
`;

// --- schema -----------------------------------------------------------------
async function schema() {
  try {
    await ensureSchema();
  } catch (err) {
    console.error("ensureSchema failed:", err.message);
  }
}

const EDIT_WINDOW_MS = 15 * 60 * 1000;
const DELETE_FOR_EVERYONE_WINDOW_MS = 48 * 60 * 60 * 1000; // 48 hours, like WhatsApp
const ALLOWED_TYPES = new Set(["text", "image", "video", "audio", "file", "poll"]);

// Puts every online participant's sockets in the conversation room, restores
// the chat for anyone who had "deleted" it, broadcasts the message, and sends
// previews. Shared by normal messages and call-log entries.
async function announceMessage(io, conversationId, message, senderId) {
  const [participants] = await pool.query(
    "SELECT user_id FROM conversation_participants WHERE conversation_id = ?",
    [conversationId]
  );

  // Anyone who had "deleted" this chat gets it back now that there's a new
  // message (the old history stays hidden for them).
  try {
    await ensureDeletedAtColumn();
    await pool.query(
      "UPDATE conversation_settings SET deleted_at = NULL WHERE conversation_id = ? AND deleted_at IS NOT NULL",
      [conversationId]
    );
  } catch (err) {
    console.error("Failed to restore deleted chat:", err.message);
  }

  // Make sure every online participant's sockets are actually in this room
  // before broadcasting - covers a brand-new conversation created after a
  // participant last connected.
  participants.forEach(({ user_id }) => {
    const set = onlineUsers.get(String(user_id));
    if (set) set.forEach((sockId) => io.sockets.sockets.get(sockId)?.join(String(conversationId)));
  });

  io.to(String(conversationId)).emit("new-message", message);

  participants.forEach(({ user_id }) => {
    const pid = String(user_id);
    if (pid !== String(senderId)) {
      emitToUser(pid, "conversation-preview", {
        conversationId: String(conversationId),
        lastMessage: {
          text: message.type === "call" ? JSON.stringify(message.call) : message.text,
          type: message.type,
          sender: String(senderId),
          timestamp: message.timestamp
        }
      });
    }
  });
}

function pushPreview(message) {
  switch (message.type) {
    case "image": return message.viewOnce ? "📷 View-once photo" : "📷 Photo";
    case "video": return message.viewOnce ? "🎥 View-once video" : "🎥 Video";
    case "audio": return "🎤 Voice message";
    case "file": return "📎 " + (message.fileName || "File");
    case "poll": return "📊 Poll";
    default: return String(message.text || "").slice(0, 140);
  }
}

// Phone/desktop notification for people who have no open tab (no socket), except
// those who muted the chat. Never blocks or fails the send.
async function pushMessageToOffline(conversationId, message, senderId) {
  try {
    if (message.type === "call") return;
    const [rows] = await pool.query(
      `SELECT cp.user_id, COALESCE(cs.muted, 0) AS muted
       FROM conversation_participants cp
       LEFT JOIN conversation_settings cs ON cs.conversation_id = cp.conversation_id AND cs.user_id = cp.user_id
       WHERE cp.conversation_id = ? AND cp.user_id <> ?`,
      [conversationId, senderId]
    );
    const targets = rows.filter((r) => !r.muted && !(onlineUsers.get(String(r.user_id))?.size));
    if (targets.length === 0) return;
    const [[convo]] = await pool.query("SELECT is_group, group_name FROM conversations WHERE id = ?", [conversationId]);
    const [[sender]] = await pool.query("SELECT name FROM users WHERE id = ?", [senderId]);
    const who = sender?.name || "New message";
    const payload = {
      title: convo?.is_group ? `${who} in ${convo.group_name || "group"}` : who,
      body: pushPreview(message),
      tag: `chat-${conversationId}`,
      conversationId: String(conversationId)
    };
    await Promise.all(targets.map((t) => pushToUser(t.user_id, payload)));
  } catch (err) {
    console.error("push (message):", err.message);
  }
}

// Sends one message on behalf of `userId`. Used by the socket handler AND by
// the scheduled-message dispatcher. Returns { message } or { error }.
async function sendMessageForUser(io, userId, payload) {
  let { conversationId, fileName, fileData, replyToId, poll } = payload || {};
  let type = ALLOWED_TYPES.has(payload?.type) ? payload.type : "text";
  let text = String(payload?.text || "").slice(0, 10000);
  let forwardCount = 0;
  let viewOnce = false;

  const [membership] = await pool.query(
    "SELECT 1 FROM conversation_participants WHERE conversation_id = ? AND user_id = ? LIMIT 1",
    [conversationId, userId]
  );
  if (membership.length === 0) return { error: "Conversation not found." };

  // Blocking only applies to 1:1 chats. It is SILENT: a blocked sender gets
  // no error - their message is saved and shows a single tick - but it's held
  // back from the other person until the block is lifted (lib/blocking.js).
  let heldBack = false;
  const [convoRows] = await pool.query("SELECT is_group, disappearing_seconds, only_admins_send FROM conversations WHERE id = ?", [conversationId]);
  const isGroup = !!convoRows[0]?.is_group;
  if (isGroup && convoRows[0]?.only_admins_send) {
    const [adm] = await pool.query(
      "SELECT is_admin FROM conversation_participants WHERE conversation_id = ? AND user_id = ?",
      [conversationId, userId]
    );
    if (!adm[0]?.is_admin) return { error: "Only admins can send messages in this group." };
  }
  if (convoRows.length && !isGroup) {
    const [otherRows] = await pool.query(
      "SELECT user_id FROM conversation_participants WHERE conversation_id = ? AND user_id != ?",
      [conversationId, userId]
    );
    const otherId = otherRows[0]?.user_id;
    if (otherId) heldBack = await isBlockedEitherWay(userId, otherId);
  }

  // Forward: the content is copied from the original on the server (never trusted
  // from the client), and the "forwarded" counter goes up by one each hop.
  if (payload?.forwardedFrom) {
    const [src] = await pool.query(
      `SELECT m.type, m.text, m.file_name, m.file_data, m.forward_count
       FROM messages m
       JOIN conversation_participants cp ON cp.conversation_id = m.conversation_id AND cp.user_id = ?
       WHERE m.id = ? AND m.deleted_for_everyone = 0 AND m.view_once = 0
         AND m.type IN ('text', 'image', 'video', 'audio', 'file')
         AND NOT EXISTS (SELECT 1 FROM message_deleted_for mdf WHERE mdf.message_id = m.id AND mdf.user_id = ?)`,
      [userId, payload.forwardedFrom, userId]
    );
    if (src.length === 0) return { error: "That message can't be forwarded." };
    type = src[0].type;
    text = String(src[0].text || "").slice(0, 10000);
    fileName = src[0].file_name || "";
    fileData = src[0].file_data || "";
    forwardCount = Math.min(255, (Number(src[0].forward_count) || 0) + 1);
  } else if (payload?.viewOnce && (type === "image" || type === "video") && fileData) {
    viewOnce = true;
  }

  // Polls: groups only, 2-8 distinct options.
  let pollOptions = null;
  if (type === "poll") {
    if (!isGroup) return { error: "Polls can only be created in groups." };
    const question = text.trim().slice(0, 300);
    const opts = [...new Set((Array.isArray(poll?.options) ? poll.options : []).map((o) => String(o || "").trim().slice(0, 120)).filter(Boolean))];
    if (!question) return { error: "A poll needs a question." };
    if (opts.length < 2) return { error: "A poll needs at least two options." };
    if (opts.length > 8) return { error: "A poll can have at most 8 options." };
    pollOptions = opts;
  } else if (type === "text" && !text.trim() && !fileData) {
    return { error: "Message is empty." };
  }

  // A reply must actually point at a message in this same conversation -
  // otherwise silently drop the reference rather than link across chats.
  let validReplyToId = null;
  if (replyToId) {
    const [replyRows] = await pool.query(
      "SELECT id FROM messages WHERE id = ? AND conversation_id = ? LIMIT 1",
      [replyToId, conversationId]
    );
    if (replyRows.length > 0) validReplyToId = replyRows[0].id;
  }

  const now = new Date();
  const storedText = type === "poll" ? text.trim().slice(0, 300) : text;
  const disappearFor = Number(convoRows[0]?.disappearing_seconds) || 0;
  const expiresAt = disappearFor > 0 ? new Date(now.getTime() + disappearFor * 1000) : null;
  const [result] = await pool.query(
    `INSERT INTO messages (conversation_id, sender_id, type, text, file_name, file_data, timestamp, reply_to_id, expires_at, view_once, forward_count)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [conversationId, userId, type, storedText, fileName || "", fileData || "", now, validReplyToId, expiresAt, viewOnce ? 1 : 0, forwardCount]
  );
  const messageId = result.insertId;

  if (pollOptions) {
    await schema();
    const [pr] = await pool.query("INSERT INTO polls (message_id, question, multiple) VALUES (?, ?, ?)", [
      messageId,
      storedText,
      poll?.multiple ? 1 : 0
    ]);
    for (let i = 0; i < pollOptions.length; i++) {
      await pool.query("INSERT INTO poll_options (poll_id, text, position) VALUES (?, ?, ?)", [pr.insertId, pollOptions[i], i]);
    }
  }

  // sender has implicitly "read" and "received" their own message
  await pool.query("INSERT IGNORE INTO message_reads (message_id, user_id) VALUES (?, ?)", [messageId, userId]);
  await pool.query("INSERT IGNORE INTO message_deliveries (message_id, user_id) VALUES (?, ?)", [messageId, userId]);

  await pool.query(
    `UPDATE conversations
     SET last_message_text = ?, last_message_type = ?, last_message_sender_id = ?, last_message_timestamp = ?
     WHERE id = ?`,
    [storedText, type, userId, now, conversationId]
  );

  const [rows] = await pool.query(`${MESSAGE_SELECT_WITH_SENDER} WHERE m.id = ?`, [messageId]);
  let replyTo = null;
  if (validReplyToId) {
    const [replyRows] = await pool.query(`${MESSAGE_SELECT_WITH_SENDER} WHERE m.id = ?`, [validReplyToId]);
    replyTo = buildReplySnippet(replyRows[0]);
  }
  const pollData = pollOptions ? (await loadPolls([messageId])).get(messageId) : null;
  const message = serializeMessage(rows[0], [userId], [userId], { replyTo, poll: pollData });

  // sending clears my saved draft for this chat on all my devices
  pool.query("DELETE FROM drafts WHERE user_id = ? AND conversation_id = ?", [userId, conversationId])
    .then(([r]) => { if (r.affectedRows > 0) emitToUser(userId, "draft-updated", { conversationId: String(conversationId), text: "" }); })
    .catch(() => {});

  if (heldBack) {
    // Only the sender's own tabs see it, right now.
    emitToUser(userId, "new-message", message);
    return { message };
  }

  await announceMessage(io, conversationId, message, userId);
  pushMessageToOffline(conversationId, message, userId);

  if (type === "text") {
    // fire-and-forget: never delays delivery
    moderateMessage({
      messageId,
      conversationId,
      text: storedText,
      emitToConversation: (event, p) => io.to(String(conversationId)).emit(event, p)
    });
  }

  maybeReplyAsYapAi(conversationId, userId).catch((err) => console.error("Yap AI reply error:", err));

  return { message };
}

// A centred notice in the chat ("Akash turned on disappearing messages").
// Kept in the chat like any message but never counts as unread.
export async function postSystemMessage(conversationId, actorId, text) {
  const io = getIo();
  const now = new Date();
  const [result] = await pool.query(
    `INSERT INTO messages (conversation_id, sender_id, type, text, timestamp) VALUES (?, ?, 'system', ?, ?)`,
    [conversationId, actorId, text, now]
  );
  await pool.query(
    `UPDATE conversations SET last_message_text = ?, last_message_type = 'system', last_message_sender_id = ?, last_message_timestamp = ? WHERE id = ?`,
    [text, actorId, now, conversationId]
  );
  const [rows] = await pool.query(`${MESSAGE_SELECT_WITH_SENDER} WHERE m.id = ?`, [result.insertId]);
  const message = serializeMessage(rows[0], [], [], {});
  if (io) await announceMessage(io, conversationId, message, actorId);
  return message;
}

// Disappearing messages: every 30s, delete what has expired, fix each chat's
// "last message", and tell open clients to drop them.
async function purgeExpired() {
  const [rows] = await pool.query(
    "SELECT id, conversation_id FROM messages WHERE expires_at IS NOT NULL AND expires_at <= ? LIMIT 1000",
    [new Date()]
  );
  if (rows.length === 0) return;
  await pool.query("DELETE FROM messages WHERE id IN (?)", [rows.map((r) => r.id)]);
  const byConvo = new Map();
  rows.forEach((r) => {
    const k = String(r.conversation_id);
    if (!byConvo.has(k)) byConvo.set(k, []);
    byConvo.get(k).push(String(r.id));
  });
  for (const [cid, ids] of byConvo) {
    const [last] = await pool.query(
      "SELECT text, type, sender_id, timestamp FROM messages WHERE conversation_id = ? ORDER BY timestamp DESC LIMIT 1",
      [cid]
    );
    await pool.query(
      "UPDATE conversations SET last_message_text = ?, last_message_type = ?, last_message_sender_id = ?, last_message_timestamp = ? WHERE id = ?",
      [last[0]?.text || "", last[0]?.type || "text", last[0]?.sender_id || null, last[0]?.timestamp || null, cid]
    );
    await emitToParticipants(cid, "messages-expired", { conversation: cid, ids });
  }
}

// --- call log ---------------------------------------------------------------
// Every 1:1 call leaves an entry in the chat: voice/video, and whether it was
// answered (with its length), missed, or declined. The server tracks each
// call from "call-user" until it ends, because only the server sees both sides.
const RING_TIMEOUT_MS = Number(process.env.YAP_RING_TIMEOUT_MS) || 45 * 1000;
const activeCalls = globalThis.__yapActiveCalls || (globalThis.__yapActiveCalls = new Map()); // userId -> call (stored under both people)

function startCallRecord(io, callerId, calleeId, callType) {
  const call = {
    callerId: String(callerId),
    calleeId: String(calleeId),
    callType: callType === "video" ? "video" : "audio",
    startedAt: Date.now(),
    answeredAt: null,
    finalized: false,
    timer: null
  };
  call.timer = setTimeout(() => {
    // Nobody picked up: log it as missed and stop both screens ringing.
    emitToUser(call.callerId, "call-ended", { fromUserId: call.calleeId });
    emitToUser(call.calleeId, "call-ended", { fromUserId: call.callerId });
    finalizeCall(io, call, "ended");
  }, RING_TIMEOUT_MS);
  activeCalls.set(call.callerId, call);
  activeCalls.set(call.calleeId, call);
  return call;
}

function callFor(userId, otherId) {
  const call = activeCalls.get(String(userId));
  if (!call) return null;
  const ids = [call.callerId, call.calleeId];
  return ids.includes(String(userId)) && ids.includes(String(otherId)) ? call : null;
}

// A call record that never rang (callee offline / busy): just enough to log it.
function startPlaceholder(callerId, calleeId, callType) {
  return {
    callerId: String(callerId),
    calleeId: String(calleeId),
    callType: callType === "video" ? "video" : "audio",
    answeredAt: null,
    finalized: false,
    timer: null
  };
}

// outcome: "ended" (answered -> completed, otherwise missed) | "declined" | "missed"
async function finalizeCall(io, call, outcome) {
  if (!call || call.finalized) return;
  call.finalized = true;
  clearTimeout(call.timer);
  if (activeCalls.get(call.callerId) === call) activeCalls.delete(call.callerId);
  if (activeCalls.get(call.calleeId) === call) activeCalls.delete(call.calleeId);

  let status = "missed";
  let duration = 0;
  if (outcome === "declined") status = "declined";
  else if (outcome === "ended" && call.answeredAt) {
    status = "completed";
    duration = Math.max(1, Math.round((Date.now() - call.answeredAt) / 1000));
  }
  try {
    await logCall(io, call, status, duration);
  } catch (err) {
    console.error("Failed to log call:", err);
  }
}

async function logCall(io, call, status, duration) {
  await schema();
  // Find the 1:1 chat between the two people (calls only exist in DMs).
  const [convos] = await pool.query(
    `SELECT c.id FROM conversations c
     JOIN conversation_participants a ON a.conversation_id = c.id AND a.user_id = ?
     JOIN conversation_participants b ON b.conversation_id = c.id AND b.user_id = ?
     WHERE c.is_group = 0 ORDER BY c.id LIMIT 1`,
    [call.callerId, call.calleeId]
  );
  const conversationId = convos[0]?.id;
  if (!conversationId) return;
  // A block means nothing about the call should surface for the other person.
  if (await isBlockedEitherWay(call.callerId, call.calleeId)) return;

  const now = new Date();
  const body = JSON.stringify({ kind: call.callType, status, duration });
  const [result] = await pool.query(
    `INSERT INTO messages (conversation_id, sender_id, type, text, timestamp) VALUES (?, ?, 'call', ?, ?)`,
    [conversationId, call.callerId, body, now]
  );
  const messageId = result.insertId;
  // Only a MISSED call stays unread for the person who was called.
  const readers = status === "missed" ? [call.callerId] : [call.callerId, call.calleeId];
  for (const uid of readers) {
    await pool.query("INSERT IGNORE INTO message_reads (message_id, user_id) VALUES (?, ?)", [messageId, uid]);
  }
  for (const uid of [call.callerId, call.calleeId]) {
    await pool.query("INSERT IGNORE INTO message_deliveries (message_id, user_id) VALUES (?, ?)", [messageId, uid]);
  }
  await pool.query(
    `UPDATE conversations
     SET last_message_text = ?, last_message_type = 'call', last_message_sender_id = ?, last_message_timestamp = ?
     WHERE id = ?`,
    [body, call.callerId, now, conversationId]
  );
  const [rows] = await pool.query(`${MESSAGE_SELECT_WITH_SENDER} WHERE m.id = ?`, [messageId]);
  const message = serializeMessage(rows[0], readers, [call.callerId, call.calleeId], {});
  await announceMessage(io, conversationId, message, call.callerId);
}

// --- group calls --------------------------------------------------------------
// Group voice/video calls are a WebRTC "mesh": every person connects directly to
// every other person, so this server only keeps track of who is in each call and
// relays the connection messages (offer / answer / ICE) between them.
const MAX_GROUP_CALL = 8;
const groupCalls = globalThis.__yapGroupCalls || (globalThis.__yapGroupCalls = new Map()); // conversationId -> room

function callRoomStatus(room) {
  return {
    conversationId: room.conversationId,
    active: true,
    callType: room.callType,
    startedAt: room.startedAt,
    participants: [...room.members.values()].map((m) => ({ id: m.id, name: m.name }))
  };
}

async function groupMemberIds(conversationId) {
  const [rows] = await pool.query("SELECT user_id FROM conversation_participants WHERE conversation_id = ?", [conversationId]);
  return rows.map((r) => String(r.user_id));
}

async function isGroupMember(userId, conversationId) {
  const [rows] = await pool.query(
    `SELECT c.group_name FROM conversations c
     JOIN conversation_participants cp ON cp.conversation_id = c.id AND cp.user_id = ?
     WHERE c.id = ? AND c.is_group = 1`,
    [userId, conversationId]
  );
  return rows[0] || null;
}

function userInCall(userId) {
  for (const room of groupCalls.values()) if (room.members.has(String(userId))) return room;
  return null;
}

async function broadcastCallStatus(room, active) {
  const payload = active ? callRoomStatus(room) : { conversationId: room.conversationId, active: false };
  const ids = await groupMemberIds(room.conversationId);
  ids.forEach((id) => emitToUser(id, "group-call-status", payload));
}

function formatCallLength(ms) {
  const s = Math.max(1, Math.round(ms / 1000));
  const m = Math.floor(s / 60);
  return m > 0 ? `${m} min ${s % 60} sec` : `${s} sec`;
}

async function leaveGroupCall(userId, conversationId) {
  const room = groupCalls.get(String(conversationId));
  if (!room || !room.members.has(String(userId))) return;
  room.members.delete(String(userId));
  room.members.forEach((m) => emitToUser(m.id, "group-call-peer-left", { conversationId: room.conversationId, userId: String(userId) }));
  if (room.members.size === 0) {
    groupCalls.delete(room.conversationId);
    await broadcastCallStatus(room, false);
    try {
      await postSystemMessage(Number(room.conversationId), room.startedBy, `${room.callType === "video" ? "Video" : "Voice"} call ended (${formatCallLength(Date.now() - room.startedAt)}).`);
    } catch (err) {
      console.error("group call end notice failed:", err.message);
    }
  } else {
    await broadcastCallStatus(room, true);
  }
}

// --- scheduled messages -------------------------------------------------------
async function runScheduled(io) {
  await schema();
  const [due] = await pool.query(
    "SELECT * FROM scheduled_messages WHERE status = 'pending' AND send_at <= ? ORDER BY send_at LIMIT 25",
    [new Date()]
  );
  for (const row of due) {
    // claim it so two ticks can never send the same message twice
    const [claim] = await pool.query("UPDATE scheduled_messages SET status = 'sending' WHERE id = ? AND status = 'pending'", [row.id]);
    if (!claim.affectedRows) continue;
    let ok = false;
    try {
      const res = await sendMessageForUser(io, String(row.sender_id), {
        conversationId: row.conversation_id,
        type: "text",
        text: row.text
      });
      ok = !res.error;
    } catch (err) {
      console.error("Scheduled send failed:", err.message);
    }
    await pool.query("UPDATE scheduled_messages SET status = ? WHERE id = ?", [ok ? "sent" : "failed", row.id]);
    emitToUser(String(row.sender_id), "scheduled-sent", {
      id: String(row.id),
      conversationId: String(row.conversation_id),
      ok
    });
  }
}

export function registerSocket(io) {
  globalThis.__yapIo = io;

  schema();
  if (!globalThis.__yapScheduler) {
    const tick = () => runScheduled(io).catch((err) => console.error("Scheduler error:", err.message));
    globalThis.__yapScheduler = setInterval(tick, 15000);
    setTimeout(tick, 4000);
  }
  if (!globalThis.__yapPurger) {
    const purge = () => purgeExpired().catch((err) => console.error("Disappearing-messages purge error:", err.message));
    globalThis.__yapPurger = setInterval(purge, 30000);
    setTimeout(purge, 6000);
  }

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error("No auth token."));
      const decoded = verifyToken(token);
      const [rows] = await pool.query(`SELECT ${USER_COLS} FROM users WHERE id = ? LIMIT 1`, [decoded.id]);
      const user = rows[0];
      if (!user) return next(new Error("Invalid user."));
      if (!(await sessionIsValid(decoded, user))) return next(new Error("Session ended."));
      socket.sid = decoded.sid || null;
      socket.userId = String(user.id);
      socket.user = user;
      next();
    } catch {
      next(new Error("Authentication failed."));
    }
  });

  io.on("connection", async (socket) => {
    const userId = socket.userId;

    if (!onlineUsers.has(userId)) onlineUsers.set(userId, new Set());
    onlineUsers.get(userId).add(socket.id);

    await pool.query("UPDATE users SET status = 'online', last_seen = NOW(3) WHERE id = ?", [userId]);

    const [conversations] = await pool.query(
      "SELECT conversation_id FROM conversation_participants WHERE user_id = ?",
      [userId]
    );
    conversations.forEach((c) => socket.join(String(c.conversation_id)));

    io.emit("presence", { userId, status: "online", lastSeen: Date.now() });

    socket.on("join-conversation", (conversationId) => {
      socket.join(String(conversationId));
    });

    socket.on("send-message", async (payload, ack) => {
      try {
        const result = await sendMessageForUser(io, userId, payload);
        ack && ack(result);
      } catch (err) {
        console.error("send-message error:", err);
        ack && ack({ error: "Failed to send message." });
      }
    });

    // Edit a text message I sent, within 15 minutes.
    socket.on("edit-message", async ({ id, text }, ack) => {
      try {
        await schema();
        const clean = String(text || "").trim().slice(0, 10000);
        if (!clean) return ack && ack({ error: "A message can't be empty." });
        const [rows] = await pool.query("SELECT * FROM messages WHERE id = ?", [id]);
        const msg = rows[0];
        if (!msg || String(msg.sender_id) !== userId || msg.type !== "text" || msg.deleted_for_everyone) {
          return ack && ack({ error: "You can't edit this message." });
        }
        if (Date.now() - new Date(msg.timestamp).getTime() > EDIT_WINDOW_MS) {
          return ack && ack({ error: "You can only edit a message for 15 minutes after sending it." });
        }
        if (clean === msg.text) return ack && ack({ ok: true });

        const editedAt = new Date();
        await pool.query("UPDATE messages SET text = ?, edited_at = ?, flagged = 0, toxicity_score = NULL WHERE id = ?", [
          clean,
          editedAt,
          id
        ]);
        // keep the chat-list preview right if this was the latest message
        await pool.query(
          "UPDATE conversations SET last_message_text = ? WHERE id = ? AND last_message_sender_id = ? AND last_message_timestamp = ?",
          [clean, msg.conversation_id, userId, msg.timestamp]
        );

        const payload = {
          id: String(id),
          conversation: String(msg.conversation_id),
          text: clean,
          editedAt: editedAt.getTime(),
          flagged: false
        };
        // While a block is active the other person must not learn about edits
        // to messages that are being held back from them.
        if (await isBlockedDm(msg.conversation_id)) emitToUser(userId, "message-edited", payload);
        else io.to(String(msg.conversation_id)).emit("message-edited", payload);

        moderateMessage({
          messageId: id,
          conversationId: msg.conversation_id,
          text: clean,
          emitToConversation: (event, p) => io.to(String(msg.conversation_id)).emit(event, p)
        });
        ack && ack({ ok: true });
      } catch (err) {
        console.error("edit-message error:", err);
        ack && ack({ error: "Couldn't edit the message." });
      }
    });

    // Vote (or un-vote) on a poll option.
    socket.on("vote-poll", async ({ pollId, optionId }, ack) => {
      try {
        await schema();
        const [pr] = await pool.query(
          `SELECT p.id, p.multiple, p.message_id, m.conversation_id, m.deleted_for_everyone
           FROM polls p JOIN messages m ON m.id = p.message_id WHERE p.id = ?`,
          [pollId]
        );
        const poll = pr[0];
        if (!poll || poll.deleted_for_everyone) return ack && ack({ error: "Poll not found." });
        const [membership] = await pool.query(
          "SELECT 1 FROM conversation_participants WHERE conversation_id = ? AND user_id = ? LIMIT 1",
          [poll.conversation_id, userId]
        );
        if (membership.length === 0) return ack && ack({ error: "Poll not found." });
        const [opt] = await pool.query("SELECT id FROM poll_options WHERE id = ? AND poll_id = ?", [optionId, poll.id]);
        if (opt.length === 0) return ack && ack({ error: "Option not found." });

        const [existing] = await pool.query("SELECT 1 FROM poll_votes WHERE option_id = ? AND user_id = ?", [optionId, userId]);
        if (existing.length > 0) {
          await pool.query("DELETE FROM poll_votes WHERE option_id = ? AND user_id = ?", [optionId, userId]);
        } else {
          if (!poll.multiple) await pool.query("DELETE FROM poll_votes WHERE poll_id = ? AND user_id = ?", [poll.id, userId]);
          await pool.query("INSERT INTO poll_votes (option_id, user_id, poll_id) VALUES (?, ?, ?)", [optionId, userId, poll.id]);
        }
        const updated = (await loadPolls([poll.message_id])).get(poll.message_id);
        io.to(String(poll.conversation_id)).emit("poll-updated", {
          messageId: String(poll.message_id),
          conversation: String(poll.conversation_id),
          poll: updated
        });
        ack && ack({ ok: true });
      } catch (err) {
        console.error("vote-poll error:", err);
        ack && ack({ error: "Couldn't record your vote." });
      }
    });

    socket.on("typing", async ({ conversationId, isTyping }) => {
      // While blocked, typing indicators don't cross over (it would reveal the block).
      try {
        if (await isBlockedDm(conversationId)) return;
      } catch {
        /* fall through and deliver */
      }
      socket.to(String(conversationId)).emit("typing", {
        conversationId,
        userId,
        name: socket.user.name,
        isTyping: !!isTyping
      });
    });

    socket.on("mark-read", async ({ conversationId }) => {
      try {
        const [unread] = await pool.query(
          `SELECT m.id FROM messages m
           WHERE m.conversation_id = ? AND m.sender_id != ?
             AND NOT EXISTS (SELECT 1 FROM message_reads mr WHERE mr.message_id = m.id AND mr.user_id = ?)
             ${hiddenByBlockSql("m")}`,
          [conversationId, userId, userId, userId, userId, userId]
        );

        if (unread.length > 0) {
          const values = unread.flatMap((m) => [m.id, userId]);
          const placeholders = unread.map(() => "(?, ?)").join(", ");
          await pool.query(`INSERT IGNORE INTO message_reads (message_id, user_id) VALUES ${placeholders}`, values);
          await pool.query(
            `INSERT IGNORE INTO message_deliveries (message_id, user_id) VALUES ${placeholders}`,
            values
          );
        }

        // No read receipts cross a block (they'd reveal it).
        if (!(await isBlockedDm(conversationId))) {
          io.to(String(conversationId)).emit("messages-read", { conversationId, userId });
        }
      } catch (err) {
        console.error("mark-read error:", err);
      }
    });

    socket.on("delete-message", async ({ id, forEveryone }) => {
      try {
        const [rows] = await pool.query("SELECT * FROM messages WHERE id = ?", [id]);
        const msg = rows[0];
        if (!msg) return;

        // "Delete for everyone" rewrites the message for every participant,
        // so only the original sender may do that.
        if (forEveryone) {
          if (String(msg.sender_id) !== userId) return;
          if (Date.now() - new Date(msg.timestamp).getTime() > DELETE_FOR_EVERYONE_WINDOW_MS) return;
          await pool.query(
            "UPDATE messages SET deleted_for_everyone = 1, text = '', file_data = '' WHERE id = ?",
            [id]
          );
          io.to(String(msg.conversation_id)).emit("message-deleted", { id: String(id), forEveryone: true });
          return;
        }

        // "Delete for me" only hides the message on this user's own devices,
        // so anyone in the conversation can do it to any message - including
        // ones they received rather than sent (matches WhatsApp's behavior).
        const [membership] = await pool.query(
          "SELECT 1 FROM conversation_participants WHERE conversation_id = ? AND user_id = ? LIMIT 1",
          [msg.conversation_id, userId]
        );
        if (membership.length === 0) return;

        await pool.query("INSERT IGNORE INTO message_deleted_for (message_id, user_id) VALUES (?, ?)", [id, userId]);
        socket.emit("message-deleted", { id: String(id), forEveryone: false });
      } catch (err) {
        console.error("delete-message error:", err);
      }
    });

    // Re-reacting with the same emoji removes it (toggle); a different emoji
    // replaces your previous reaction, matching WhatsApp - one reaction per
    // person per message.
    socket.on("react-message", async ({ messageId, emoji }) => {
      try {
        if (!messageId || !emoji) return;
        const [msgRows] = await pool.query("SELECT conversation_id FROM messages WHERE id = ?", [messageId]);
        const msg = msgRows[0];
        if (!msg) return;
        const [membership] = await pool.query(
          "SELECT 1 FROM conversation_participants WHERE conversation_id = ? AND user_id = ? LIMIT 1",
          [msg.conversation_id, userId]
        );
        if (membership.length === 0) return;

        const [existing] = await pool.query(
          "SELECT emoji FROM message_reactions WHERE message_id = ? AND user_id = ?",
          [messageId, userId]
        );
        if (existing.length > 0 && existing[0].emoji === emoji) {
          await pool.query("DELETE FROM message_reactions WHERE message_id = ? AND user_id = ?", [messageId, userId]);
        } else {
          await pool.query(
            "INSERT INTO message_reactions (message_id, user_id, emoji) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE emoji = VALUES(emoji)",
            [messageId, userId, emoji]
          );
        }

        const [reactionRows] = await pool.query(
          "SELECT user_id, emoji FROM message_reactions WHERE message_id = ?",
          [messageId]
        );
        const reactions = reactionRows.map((r) => ({ emoji: r.emoji, userId: String(r.user_id) }));
        io.to(String(msg.conversation_id)).emit("message-reaction", { messageId: String(messageId), reactions });
      } catch (err) {
        console.error("react-message error:", err);
      }
    });

    socket.on("toggle-pin", async ({ messageId }) => {
      try {
        const [msgRows] = await pool.query("SELECT conversation_id, pinned FROM messages WHERE id = ?", [messageId]);
        const msg = msgRows[0];
        if (!msg) return;
        const [membership] = await pool.query(
          "SELECT 1 FROM conversation_participants WHERE conversation_id = ? AND user_id = ? LIMIT 1",
          [msg.conversation_id, userId]
        );
        if (membership.length === 0) return;

        const pinned = !msg.pinned;
        await pool.query("UPDATE messages SET pinned = ? WHERE id = ?", [pinned ? 1 : 0, messageId]);
        io.to(String(msg.conversation_id)).emit("message-pinned", { messageId: String(messageId), pinned });
      } catch (err) {
        console.error("toggle-pin error:", err);
      }
    });

    // Starring is private - only the star-er sees it, so this replies via ack
    // instead of broadcasting to the room.
    socket.on("toggle-star", async ({ messageId }, ack) => {
      try {
        const [existing] = await pool.query(
          "SELECT 1 FROM message_stars WHERE message_id = ? AND user_id = ?",
          [messageId, userId]
        );
        let starred;
        if (existing.length > 0) {
          await pool.query("DELETE FROM message_stars WHERE message_id = ? AND user_id = ?", [messageId, userId]);
          starred = false;
        } else {
          await pool.query("INSERT IGNORE INTO message_stars (message_id, user_id) VALUES (?, ?)", [messageId, userId]);
          starred = true;
        }
        ack && ack({ starred });
      } catch (err) {
        console.error("toggle-star error:", err);
        ack && ack({ error: "Failed to update star." });
      }
    });

    // --- WebRTC call signaling -------------------------------------------
    // This server only relays offer/answer/ICE messages between the two
    // participants' sockets; the actual audio/video stream is peer-to-peer.

    socket.on("call-user", async ({ toUserId, conversationId, callType, offer }) => {
      // Blocked either way: the call never reaches the other side. The caller
      // just sees the normal "unavailable" result, same as if they were offline.
      try {
        if (await isBlockedEitherWay(userId, toUserId)) {
          return socket.emit("call-unavailable", { toUserId });
        }
      } catch (err) {
        console.error("call block check failed:", err.message);
      }

      // Someone already on a call can't be rung; count it as a missed call.
      const stale = activeCalls.get(userId);
      if (stale) finalizeCall(io, stale, "ended");
      const calleeBusy = activeCalls.has(String(toUserId)) || !!userInCall(toUserId);

      const delivered = !calleeBusy && emitToUser(toUserId, "incoming-call", {
        fromUserId: userId,
        fromName: socket.user.name,
        fromAvatarColor: socket.user.avatar_color,
        fromAvatarUrl: userAvatarFromRow(socket.user),
        conversationId,
        callType,
        offer
      });
      if (!delivered) {
        socket.emit("call-unavailable", { toUserId });
        // they were offline/busy: still leaves a "missed call" in the chat
        finalizeCall(io, { ...startPlaceholder(userId, toUserId, callType) }, "ended");
        if (!calleeBusy) {
          pushToUser(toUserId, {
            title: socket.user.name,
            body: `Missed ${callType === "video" ? "video" : "voice"} call`,
            tag: `call-${userId}`,
            conversationId: conversationId ? String(conversationId) : undefined
          }, { urgency: "high" }).catch(() => {});
        }
        return;
      }
      startCallRecord(io, userId, toUserId, callType);
    });

    socket.on("call-answer", ({ toUserId, answer }) => {
      const call = callFor(userId, toUserId);
      if (call && !call.answeredAt) {
        call.answeredAt = Date.now();
        clearTimeout(call.timer);
      }
      emitToUser(toUserId, "call-answered", { fromUserId: userId, answer });
    });

    // Adding/removing video mid-call (e.g. screen sharing in a voice call)
    socket.on("call-renegotiate", ({ toUserId, description }) => {
      const call = callFor(userId, toUserId);
      if (!call) return;
      emitToUser(toUserId, "call-renegotiate", { fromUserId: userId, description });
    });

    // ---- group calls ----
    socket.on("group-call-start", async ({ conversationId, callType }, ack) => {
      const reply = typeof ack === "function" ? ack : () => {};
      try {
        const cid = String(conversationId);
        const group = await isGroupMember(userId, cid);
        if (!group) return reply({ error: "Group not found." });
        if (userInCall(userId) || activeCalls.has(userId)) return reply({ error: "You're already on a call." });
        let room = groupCalls.get(cid);
        const me = { id: userId, name: socket.user.name, avatarColor: socket.user.avatar_color, avatarUrl: userAvatarFromRow(socket.user), muted: false, videoOff: false, sharing: false };
        if (room) {
          // a call is already running: starting one means joining it
          if (room.members.size >= MAX_GROUP_CALL) return reply({ error: `Group calls support up to ${MAX_GROUP_CALL} people.` });
          const others = [...room.members.values()];
          room.members.set(userId, me);
          others.forEach((m) => emitToUser(m.id, "group-call-peer-joined", { conversationId: cid, peer: me }));
          await broadcastCallStatus(room, true);
          return reply({ ok: true, callType: room.callType, peers: others });
        }
        room = { conversationId: cid, callType: callType === "video" ? "video" : "audio", startedAt: Date.now(), startedBy: userId, members: new Map([[userId, me]]) };
        groupCalls.set(cid, room);
        const ids = await groupMemberIds(cid);
        ids.filter((id) => id !== userId).forEach((id) =>
          emitToUser(id, "group-call-incoming", {
            conversationId: cid,
            groupName: group.group_name,
            callType: room.callType,
            fromUserId: userId,
            fromName: socket.user.name
          })
        );
        await broadcastCallStatus(room, true);
        postSystemMessage(Number(cid), userId, `${socket.user.name} started a ${room.callType} call.`).catch(() => {});
        reply({ ok: true, callType: room.callType, peers: [] });
      } catch (err) {
        console.error("group-call-start failed:", err.message);
        reply({ error: "Couldn't start the call." });
      }
    });

    socket.on("group-call-join", async ({ conversationId }, ack) => {
      const reply = typeof ack === "function" ? ack : () => {};
      try {
        const cid = String(conversationId);
        if (!(await isGroupMember(userId, cid))) return reply({ error: "Group not found." });
        const room = groupCalls.get(cid);
        if (!room) return reply({ error: "That call has ended." });
        if (room.members.has(userId)) return reply({ ok: true, callType: room.callType, peers: [...room.members.values()].filter((m) => m.id !== userId) });
        if (userInCall(userId) || activeCalls.has(userId)) return reply({ error: "You're already on a call." });
        if (room.members.size >= MAX_GROUP_CALL) return reply({ error: `Group calls support up to ${MAX_GROUP_CALL} people.` });
        const me = { id: userId, name: socket.user.name, avatarColor: socket.user.avatar_color, avatarUrl: userAvatarFromRow(socket.user), muted: false, videoOff: false, sharing: false };
        const others = [...room.members.values()];
        room.members.set(userId, me);
        others.forEach((m) => emitToUser(m.id, "group-call-peer-joined", { conversationId: cid, peer: me }));
        await broadcastCallStatus(room, true);
        reply({ ok: true, callType: room.callType, peers: others });
      } catch (err) {
        console.error("group-call-join failed:", err.message);
        reply({ error: "Couldn't join the call." });
      }
    });

    socket.on("group-call-signal", ({ conversationId, toUserId, signal }) => {
      const room = groupCalls.get(String(conversationId));
      if (!room || !room.members.has(userId) || !room.members.has(String(toUserId))) return;
      emitToUser(toUserId, "group-call-signal", { conversationId: String(conversationId), fromUserId: userId, signal });
    });

    socket.on("group-call-media-state", ({ conversationId, muted, videoOff, sharing }) => {
      const room = groupCalls.get(String(conversationId));
      const me = room?.members.get(userId);
      if (!me) return;
      Object.assign(me, { muted: !!muted, videoOff: !!videoOff, sharing: !!sharing });
      room.members.forEach((m) => {
        if (m.id !== userId) emitToUser(m.id, "group-call-media-state", { conversationId: room.conversationId, userId, muted: !!muted, videoOff: !!videoOff, sharing: !!sharing });
      });
    });

    socket.on("group-call-leave", ({ conversationId }) => {
      leaveGroupCall(userId, conversationId).catch((err) => console.error("group-call-leave failed:", err.message));
    });

    // What group calls are running in the chats I'm in (so a "Join" banner can show)
    socket.on("group-calls-list", async (ack) => {
      if (typeof ack !== "function") return;
      const mine = [];
      for (const room of groupCalls.values()) {
        if (await isGroupMember(userId, room.conversationId)) mine.push(callRoomStatus(room));
      }
      ack(mine);
    });

    socket.on("call-ice-candidate", ({ toUserId, candidate }) => {
      emitToUser(toUserId, "call-ice-candidate", { fromUserId: userId, candidate });
    });

    socket.on("call-reject", ({ toUserId }) => {
      const call = callFor(userId, toUserId);
      if (call) finalizeCall(io, call, call.answeredAt ? "ended" : "declined");
      emitToUser(toUserId, "call-rejected", { fromUserId: userId });
    });

    socket.on("call-end", ({ toUserId }) => {
      const call = callFor(userId, toUserId);
      if (call) finalizeCall(io, call, "ended");
      emitToUser(toUserId, "call-ended", { fromUserId: userId });
    });

    socket.on("disconnect", async () => {
      const set = onlineUsers.get(userId);
      if (set) {
        set.delete(socket.id);
        if (set.size === 0) {
          onlineUsers.delete(userId);
          // dropping off mid-call ends it for the other person too
          for (const room of [...groupCalls.values()]) {
            if (room.members.has(userId)) leaveGroupCall(userId, room.conversationId).catch(() => {});
          }
          const dropped = activeCalls.get(userId);
          if (dropped) {
            const otherId = dropped.callerId === userId ? dropped.calleeId : dropped.callerId;
            emitToUser(otherId, "call-ended", { fromUserId: userId });
            finalizeCall(io, dropped, "ended");
          }
          const lastSeen = Date.now();
          await pool.query("UPDATE users SET status = 'offline', last_seen = ? WHERE id = ?", [new Date(lastSeen), userId]);
          io.emit("presence", { userId, status: "offline", lastSeen });
        }
      }
    });
  });
}
