import { verifyToken } from "./jwt.js";
import pool from "./db.js";
import { serializeMessage, buildReplySnippet } from "./messages.js";
import { getBotUserId } from "./yapAiBot.js";
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

export { emitToUser };

// Inserts a message from the Yap AI bot (text or generated image), updates
// the conversation preview, and broadcasts it - shared by both reply modes
// below so they don't duplicate the bookkeeping.
async function insertBotMessage(conversationId, botId, humanUserId, { type = "text", text = "", fileName = "", fileData = "" }) {
  const io = getIo();
  const now = new Date();
  const [result] = await pool.query(
    `INSERT INTO messages (conversation_id, sender_id, type, text, file_name, file_data, timestamp)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [conversationId, botId, type, text, fileName, fileData, now]
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
  SELECT m.*, u.username AS sender_username, u.name AS sender_name, u.avatar_color AS sender_avatar_color
  FROM messages m
  JOIN users u ON u.id = m.sender_id
`;

export function registerSocket(io) {
  globalThis.__yapIo = io;

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error("No auth token."));
      const decoded = verifyToken(token);
      const [rows] = await pool.query("SELECT * FROM users WHERE id = ? LIMIT 1", [decoded.id]);
      const user = rows[0];
      if (!user) return next(new Error("Invalid user."));
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
        const { conversationId, text, type, fileName, fileData, replyToId } = payload;

        const [membership] = await pool.query(
          "SELECT 1 FROM conversation_participants WHERE conversation_id = ? AND user_id = ? LIMIT 1",
          [conversationId, userId]
        );
        if (membership.length === 0) return ack && ack({ error: "Conversation not found." });

        // Blocking only applies to 1:1 chats - if either side has blocked
        // the other, messages stop flowing both ways (matches WhatsApp).
        const [convoRows] = await pool.query("SELECT is_group FROM conversations WHERE id = ?", [conversationId]);
        if (convoRows.length && !convoRows[0].is_group) {
          const [otherRows] = await pool.query(
            "SELECT user_id FROM conversation_participants WHERE conversation_id = ? AND user_id != ?",
            [conversationId, userId]
          );
          const otherId = otherRows[0]?.user_id;
          if (otherId) {
            const [blockRows] = await pool.query(
              `SELECT 1 FROM blocked_users
               WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)`,
              [userId, otherId, otherId, userId]
            );
            if (blockRows.length > 0) {
              return ack && ack({ error: "You can't send a message to this contact." });
            }
          }
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
        const [result] = await pool.query(
          `INSERT INTO messages (conversation_id, sender_id, type, text, file_name, file_data, timestamp, reply_to_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [conversationId, userId, type || "text", text || "", fileName || "", fileData || "", now, validReplyToId]
        );
        const messageId = result.insertId;

        // sender has implicitly "read" and "received" their own message
        await pool.query("INSERT IGNORE INTO message_reads (message_id, user_id) VALUES (?, ?)", [messageId, userId]);
        await pool.query("INSERT IGNORE INTO message_deliveries (message_id, user_id) VALUES (?, ?)", [messageId, userId]);

        await pool.query(
          `UPDATE conversations
           SET last_message_text = ?, last_message_type = ?, last_message_sender_id = ?, last_message_timestamp = ?
           WHERE id = ?`,
          [text || "", type || "text", userId, now, conversationId]
        );

        const [rows] = await pool.query(`${MESSAGE_SELECT_WITH_SENDER} WHERE m.id = ?`, [messageId]);
        let replyTo = null;
        if (validReplyToId) {
          const [replyRows] = await pool.query(`${MESSAGE_SELECT_WITH_SENDER} WHERE m.id = ?`, [validReplyToId]);
          replyTo = buildReplySnippet(replyRows[0]);
        }
        const message = serializeMessage(rows[0], [userId], [userId], { replyTo });

        const [participants] = await pool.query(
          "SELECT user_id FROM conversation_participants WHERE conversation_id = ?",
          [conversationId]
        );

        // Make sure every online participant's sockets are actually in this
        // room before broadcasting - covers a brand-new conversation created
        // after a participant last connected (e.g. after "delete chat" +
        // re-messaging), which they'd otherwise miss in real time.
        participants.forEach(({ user_id }) => {
          const set = onlineUsers.get(String(user_id));
          if (set) set.forEach((sockId) => io.sockets.sockets.get(sockId)?.join(String(conversationId)));
        });

        io.to(String(conversationId)).emit("new-message", message);

        participants.forEach(({ user_id }) => {
          const pid = String(user_id);
          if (pid !== userId) {
            emitToUser(pid, "conversation-preview", {
              conversationId: String(conversationId),
              lastMessage: { text: message.text, type: message.type, sender: userId, timestamp: message.timestamp }
            });
          }
        });

        ack && ack({ message });

        maybeReplyAsYapAi(conversationId, userId).catch((err) =>
          console.error("Yap AI reply error:", err)
        );
      } catch (err) {
        console.error("send-message error:", err);
        ack && ack({ error: "Failed to send message." });
      }
    });

    socket.on("typing", ({ conversationId, isTyping }) => {
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
             AND NOT EXISTS (SELECT 1 FROM message_reads mr WHERE mr.message_id = m.id AND mr.user_id = ?)`,
          [conversationId, userId, userId]
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

        io.to(String(conversationId)).emit("messages-read", { conversationId, userId });
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

    socket.on("call-user", ({ toUserId, conversationId, callType, offer }) => {
      const delivered = emitToUser(toUserId, "incoming-call", {
        fromUserId: userId,
        fromName: socket.user.name,
        fromAvatarColor: socket.user.avatar_color,
        fromAvatarUrl: socket.user.avatar_url || "",
        conversationId,
        callType,
        offer
      });
      if (!delivered) socket.emit("call-unavailable", { toUserId });
    });

    socket.on("call-answer", ({ toUserId, answer }) => {
      emitToUser(toUserId, "call-answered", { fromUserId: userId, answer });
    });

    socket.on("call-ice-candidate", ({ toUserId, candidate }) => {
      emitToUser(toUserId, "call-ice-candidate", { fromUserId: userId, candidate });
    });

    socket.on("call-reject", ({ toUserId }) => {
      emitToUser(toUserId, "call-rejected", { fromUserId: userId });
    });

    socket.on("call-end", ({ toUserId }) => {
      emitToUser(toUserId, "call-ended", { fromUserId: userId });
    });

    socket.on("disconnect", async () => {
      const set = onlineUsers.get(userId);
      if (set) {
        set.delete(socket.id);
        if (set.size === 0) {
          onlineUsers.delete(userId);
          const lastSeen = Date.now();
          await pool.query("UPDATE users SET status = 'offline', last_seen = ? WHERE id = ?", [new Date(lastSeen), userId]);
          io.emit("presence", { userId, status: "offline", lastSeen });
        }
      }
    });
  });
}
