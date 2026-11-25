import pool from "./db.js";

// People whose statuses I may see: everyone I have a 1:1 chat with, minus
// anyone blocked in either direction (blocking stays silent - their status
// simply doesn't show up).
export async function getContactIds(userId) {
  const [rows] = await pool.query(
    `SELECT DISTINCT cp2.user_id AS id
     FROM conversation_participants cp1
     JOIN conversations c ON c.id = cp1.conversation_id AND c.is_group = 0
     JOIN conversation_participants cp2 ON cp2.conversation_id = c.id AND cp2.user_id <> cp1.user_id
     WHERE cp1.user_id = ?
       AND NOT EXISTS (
         SELECT 1 FROM blocked_users b
         WHERE (b.blocker_id = cp1.user_id AND b.blocked_id = cp2.user_id)
            OR (b.blocker_id = cp2.user_id AND b.blocked_id = cp1.user_id)
       )`,
    [userId]
  );
  return rows.map((r) => String(r.id));
}

export const STATUS_TTL_MS = 24 * 60 * 60 * 1000;
