import pool from "@/lib/db";
import { hiddenByBlockSql } from "@/lib/blocking";
import { ensureSchema, notExpiredSql } from "@/lib/ensureSchema";

// The WHERE-clause (and params) for "the messages of this chat that I am allowed
// to see": not deleted, not cleared by me, not expired, not held back by a block.
// Returns null when I'm not in the conversation.
export async function visibleScope(userId, conversationId) {
  await ensureSchema();
  const [[membership], [settingsRows]] = await Promise.all([
    pool.query("SELECT 1 FROM conversation_participants WHERE conversation_id = ? AND user_id = ? LIMIT 1", [conversationId, userId]),
    pool.query("SELECT cleared_before FROM conversation_settings WHERE conversation_id = ? AND user_id = ?", [conversationId, userId])
  ]);
  if (membership.length === 0) return null;
  const clearedBefore = settingsRows[0]?.cleared_before || null;
  const where = `m.conversation_id = ?
    AND m.type NOT IN ('system', 'call')
    AND m.deleted_for_everyone = 0
    ${clearedBefore ? "AND m.timestamp > ?" : ""}
    AND NOT EXISTS (SELECT 1 FROM message_deleted_for mdf WHERE mdf.message_id = m.id AND mdf.user_id = ?)
    ${notExpiredSql("m")}
    ${hiddenByBlockSql("m")}`;
  const params = clearedBefore
    ? [conversationId, clearedBefore, userId, userId, userId, userId]
    : [conversationId, userId, userId, userId, userId];
  return { where, params };
}
