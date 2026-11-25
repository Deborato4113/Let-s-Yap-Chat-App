import pool from "@/lib/db";
import { getUserFromRequest } from "@/lib/authServer";
import { ensureSchema } from "@/lib/ensureSchema";

// Cancel one of my scheduled messages (only while it's still pending).
export async function DELETE(req, { params }) {
  const me = await getUserFromRequest(req);
  if (!me) return Response.json({ message: "Missing or invalid auth token." }, { status: 401 });
  await ensureSchema();

  const { id } = await params;
  const [result] = await pool.query(
    "UPDATE scheduled_messages SET status = 'cancelled' WHERE id = ? AND sender_id = ? AND status = 'pending'",
    [Number(id), me.id]
  );
  if (!result.affectedRows) return Response.json({ message: "Already sent or not found." }, { status: 404 });
  return Response.json({ ok: true });
}
