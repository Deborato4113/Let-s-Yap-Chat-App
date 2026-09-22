import pool from "@/lib/db";
import { getUserFromRequest } from "@/lib/authServer";
import { toPublicUser } from "@/lib/serialize";

export async function GET(req) {
  const me = await getUserFromRequest(req);
  if (!me) return Response.json({ message: "Missing or invalid auth token." }, { status: 401 });

  const q = new URL(req.url).searchParams.get("q")?.trim() || "";
  let rows;
  if (q) {
    const like = `%${q}%`;
    [rows] = await pool.query(
      "SELECT * FROM users WHERE id != ? AND (username LIKE ? OR name LIKE ?) LIMIT 50",
      [me.id, like, like]
    );
  } else {
    [rows] = await pool.query("SELECT * FROM users WHERE id != ? LIMIT 50", [me.id]);
  }

  return Response.json(rows.map(toPublicUser));
}
