import pool from "@/lib/db";
import { ensureSchema } from "@/lib/ensureSchema";

// Shared by the group admin routes: loads a group and who I am in it.
export async function loadGroupAs(userId, conversationId) {
  await ensureSchema();
  const [rows] = await pool.query(
    `SELECT c.*, cp.is_admin AS my_admin FROM conversations c
     JOIN conversation_participants cp ON cp.conversation_id = c.id AND cp.user_id = ?
     WHERE c.id = ? AND c.is_group = 1`,
    [userId, conversationId]
  );
  if (!rows[0]) return null;
  return { group: rows[0], isAdmin: !!rows[0].my_admin };
}

export function parseId(v) {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}
