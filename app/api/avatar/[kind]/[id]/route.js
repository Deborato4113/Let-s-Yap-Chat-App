import pool from "@/lib/db";

export const runtime = "nodejs";

// Serves a profile (kind "u") or group (kind "g") photo as a real image so the
// browser can cache it. The ?v= checksum in the link changes when the photo does.
export async function GET(req, { params }) {
  const { kind, id } = await params;
  const n = Number(id);
  if (!Number.isInteger(n) || !["u", "g"].includes(kind)) return new Response("Not found", { status: 404 });
  const [rows] = await pool.query(
    kind === "u" ? "SELECT avatar_url AS a FROM users WHERE id = ?" : "SELECT group_avatar_url AS a FROM conversations WHERE id = ?",
    [n]
  );
  const a = rows[0]?.a;
  if (!a) return new Response("Not found", { status: 404 });
  if (/^https?:\/\//i.test(a)) return Response.redirect(a, 302); // e.g. a Google profile picture
  const m = /^data:(image\/[a-z0-9.+-]+);base64,(.*)$/is.exec(a);
  if (!m) return new Response("Not found", { status: 404 });
  return new Response(Buffer.from(m[2], "base64"), {
    headers: { "Content-Type": m[1], "Cache-Control": "public, max-age=31536000, immutable" }
  });
}
