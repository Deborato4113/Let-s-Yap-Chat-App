import pool from "@/lib/db";
import { getUserFromRequest } from "@/lib/authServer";
import { ensureSchema } from "@/lib/ensureSchema";

// All my unsent drafts, { [conversationId]: text }, so they follow me to any device.
export async function GET(req) {
  const me = await getUserFromRequest(req);
  if (!me) return Response.json({ message: "Missing or invalid auth token." }, { status: 401 });
  await ensureSchema();
  const [rows] = await pool.query("SELECT conversation_id, text FROM drafts WHERE user_id = ?", [me.id]);
  const drafts = {};
  rows.forEach((r) => { drafts[String(r.conversation_id)] = r.text; });
  return Response.json({ drafts });
}
