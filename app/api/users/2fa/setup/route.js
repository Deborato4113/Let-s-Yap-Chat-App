import pool from "@/lib/db";
import { getUserFromRequest } from "@/lib/authServer";
import { ensureSchema } from "@/lib/ensureSchema";
import { generateSecret, otpauthUri } from "@/lib/totp";
import qrcode from "@/lib/vendor/qrcode";

// Step 1 of turning on two-step verification: make a secret and show it as a QR code.
export async function POST(req) {
  const me = await getUserFromRequest(req);
  if (!me) return Response.json({ message: "Missing or invalid auth token." }, { status: 401 });
  await ensureSchema();
  if (me.totp_enabled) return Response.json({ message: "Two-step verification is already on." }, { status: 400 });
  const secret = generateSecret();
  await pool.query("UPDATE users SET totp_secret = ?, totp_enabled = 0 WHERE id = ?", [secret, me.id]);
  const uri = otpauthUri(secret, me.email || me.username);
  const qr = qrcode(0, "M");
  qr.addData(uri);
  qr.make();
  return Response.json({ secret, uri, qrSvg: qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true }) });
}
