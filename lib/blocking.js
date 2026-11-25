import pool from "./db.js";

// Blocking is SILENT, like WhatsApp: the blocked person is never told.
// While a block is active between two people in a 1:1 chat, every message
// either of them sends AFTER the block started is held back from the other
// side (the sender still sees it, with a single tick). Deleting the row from
// blocked_users on unblock is all it takes for the held-back messages to show
// up on both sides - nothing is deleted or rewritten.
//
// SQL fragment (3 `?` params, all the viewer's user id): excludes messages
// the viewer must not see yet. `m` is the messages table alias.
export function hiddenByBlockSql(alias = "m") {
  return `AND NOT EXISTS (
    SELECT 1 FROM blocked_users bu
    JOIN conversations bc ON bc.id = ${alias}.conversation_id AND bc.is_group = 0
    WHERE ${alias}.sender_id != ?
      AND ((bu.blocker_id = ? AND bu.blocked_id = ${alias}.sender_id)
        OR (bu.blocker_id = ${alias}.sender_id AND bu.blocked_id = ?))
      AND ${alias}.timestamp >= bu.created_at
  )`;
}

// Is there an active block in either direction between these two users?
export async function isBlockedEitherWay(a, b) {
  const [rows] = await pool.query(
    `SELECT 1 FROM blocked_users
     WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?) LIMIT 1`,
    [a, b, b, a]
  );
  return rows.length > 0;
}

// Ids of users who have blocked `userId` (they must not see that user's
// profile picture / online status, and can't add them to groups).
export async function getBlockersOf(userId) {
  const [rows] = await pool.query("SELECT blocker_id FROM blocked_users WHERE blocked_id = ?", [userId]);
  return new Set(rows.map((r) => String(r.blocker_id)));
}

// True if `conversationId` is a 1:1 chat and there's an active block between
// its two people (in either direction).
export async function isBlockedDm(conversationId) {
  const [rows] = await pool.query(
    `SELECT 1 FROM conversations c
     JOIN conversation_participants p1 ON p1.conversation_id = c.id
     JOIN conversation_participants p2 ON p2.conversation_id = c.id AND p2.user_id != p1.user_id
     JOIN blocked_users bu ON bu.blocker_id = p1.user_id AND bu.blocked_id = p2.user_id
     WHERE c.id = ? AND c.is_group = 0 LIMIT 1`,
    [conversationId]
  );
  return rows.length > 0;
}
