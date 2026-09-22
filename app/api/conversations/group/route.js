import pool from "@/lib/db";
import { getUserFromRequest } from "@/lib/authServer";
import { buildConversationPayload } from "@/lib/conversations";

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

  const memberIds = Array.from(new Set([me.id, ...ids]));

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

    await connection.commit();

    const [rows] = await connection.query("SELECT * FROM conversations WHERE id = ?", [result.insertId]);
    const payload = await buildConversationPayload(rows[0], me.id);
    return Response.json(payload, { status: 201 });
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}
