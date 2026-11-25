import pool from "@/lib/db";
import { getUserFromRequest } from "@/lib/authServer";
import { ensureSchema } from "@/lib/ensureSchema";

export async function POST(req) {
  const me = await getUserFromRequest(req);
  if (!me) return Response.json({ message: "Missing or invalid auth token." }, { status: 401 });
  await ensureSchema();
  const { endpoint } = (await req.json()) || {};
  if (typeof endpoint !== "string") return Response.json({ message: "Missing endpoint." }, { status: 400 });
  await pool.query("DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?", [me.id, endpoint]);
  return Response.json({ ok: true });
}
