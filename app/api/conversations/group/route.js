import { convoCols } from "@/lib/avatars";
import pool from "@/lib/db";
import { ensureSchema } from "@/lib/ensureSchema";
import { getUserFromRequest } from "@/lib/authServer";
import { buildConversationPayload } from "@/lib/conversations";
import { getBlockersOf } from "@/lib/blocking";

export async function POST(req) {
  const me = await getUserFromRequest(req);
  if (!me) return Response.json({ message: "Missing or invalid auth token." }, { status: 401 });

  const { name, participantIds } = await req.json();
  if (!name || !name.trim()) {
    return Response.json({ message: "Group name is required." }, { status: 400 });
  }

  const ids = Array.isArray(participantIds)
    ? participantIds.map(Number).filter((id) => Number.isInteger(id) && id > 0)
    : [];
  if (ids.length < 1) {
    return Response.json({ message: "Select at least one other member." }, { status: 400 });
  }

  // Anyone who has blocked me can't be added to my groups. They're skipped
  // silently - an error here would tell me I'm blocked.
  const blockers = await getBlockersOf(me.id);
  const memberIds = Array.from(new Set([me.id, ...ids.filter((id) => !blockers.has(String(id)))]));

  await ensureSchema();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [result] = await connection.query(
      "INSERT INTO conversations (is_group, group_name, created_by) VALUES (1, ?, ?)",
      [name.trim().slice(0, 60), me.id]
    );

    const values = memberIds.flatMap((id) => [result.insertId, id]);
    const placeholders = memberIds.map(() => "(?, ?)").join(", ");
    await connection.query(
      `INSERT INTO conversation_participants (conversation_id, user_id) VALUES ${placeholders}`,
      values
    );

    await connection.query("UPDATE conversation_participants SET is_admin = 1 WHERE conversation_id = ? AND user_id = ?", [result.insertId, me.id]);
    await connection.query(
      "UPDATE conversations SET disappearing_seconds = COALESCE((SELECT default_disappearing_seconds FROM users WHERE id = ?), 0) WHERE id = ?",
      [me.id, result.insertId]
    );
    await connection.commit();

    const [rows] = await connection.query(`SELECT ${convoCols("conversations")} FROM conversations WHERE id = ?`, [result.insertId]);
    const payload = await buildConversationPayload(rows[0], me.id);
    return Response.json(payload, { status: 201 });
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}
