import pool from "./db.js";

// "Yap AI" is a real user row (is_bot = 1) with a real 1:1 conversation, so it
// rides on every existing chat feature for free - persistence, read
// receipts, reactions, replies, forwarding, pinning - instead of needing a
// parallel system. cachedBotId is just a per-module-instance perf cache
// (the DB row is the single source of truth), so it's fine that server.js
// and the Next API routes each hold their own copy.
const BOT_USERNAME = "yapai";
const BOT_EMAIL = "yap-ai@system.local";
const BOT_NAME = "Yap AI";
const BOT_BIO = "Your built-in AI assistant. Ask me anything ✨";
const BOT_COLOR = "#00A884";

let cachedBotId = null;

export async function getBotUserId() {
  if (cachedBotId) return cachedBotId;

  const [rows] = await pool.query("SELECT id FROM users WHERE username = ? LIMIT 1", [BOT_USERNAME]);
  if (rows.length > 0) {
    cachedBotId = rows[0].id;
    return cachedBotId;
  }

  const [result] = await pool.query(
    `INSERT INTO users (username, email, password, name, bio, avatar_color, status, is_bot)
     VALUES (?, ?, NULL, ?, ?, ?, 'online', 1)`,
    [BOT_USERNAME, BOT_EMAIL, BOT_NAME, BOT_BIO, BOT_COLOR]
  );
  cachedBotId = result.insertId;
  return cachedBotId;
}

// Every user gets exactly one standing conversation with Yap AI, created the
// first time it's needed (or on next migrate) and reused forever after -
// same as Meta AI always being pinned in a WhatsApp chat list.
export async function getOrCreateBotConversation(userId) {
  const botId = await getBotUserId();

  const [existing] = await pool.query(
    `SELECT c.id FROM conversations c
     JOIN conversation_participants cp1 ON cp1.conversation_id = c.id AND cp1.user_id = ?
     JOIN conversation_participants cp2 ON cp2.conversation_id = c.id AND cp2.user_id = ?
     WHERE c.is_group = 0
     LIMIT 1`,
    [userId, botId]
  );
  if (existing.length > 0) return existing[0].id;

  const [result] = await pool.query("INSERT INTO conversations (is_group, created_by) VALUES (0, ?)", [userId]);
  const conversationId = result.insertId;
  await pool.query(
    "INSERT INTO conversation_participants (conversation_id, user_id) VALUES (?, ?), (?, ?)",
    [conversationId, userId, conversationId, botId]
  );
  return conversationId;
}

export async function isBotConversation(conversationId) {
  const botId = await getBotUserId();
  const [rows] = await pool.query(
    "SELECT 1 FROM conversation_participants WHERE conversation_id = ? AND user_id = ? LIMIT 1",
    [conversationId, botId]
  );
  return rows.length > 0;
}
