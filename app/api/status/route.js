import { userAvatarFromRow } from "@/lib/avatars";
import pool from "@/lib/db";
import { getUserFromRequest } from "@/lib/authServer";
import { ensureSchema } from "@/lib/ensureSchema";
import { emitToUser } from "@/lib/socketServer";
import { getContactIds, STATUS_TTL_MS } from "@/lib/statusHelpers";

const MAX_IMAGE_CHARS = 3_000_000; // data URL length (the browser downsizes first)
const MAX_ACTIVE = 30;

// Feed: my own active statuses + my contacts' active statuses (last 24 hours).
export async function GET(req) {
  const me = await getUserFromRequest(req);
  if (!me) return Response.json({ message: "Missing or invalid auth token." }, { status: 401 });
  await ensureSchema();

  const contactIds = await getContactIds(me.id);
  const ids = [String(me.id), ...contactIds];
  const ph = ids.map(() => "?").join(", ");

  const [rows] = await pool.query(
    `SELECT s.id, s.user_id, s.kind, s.text, s.bg_color, s.created_at,
            u.id AS uid_, u.name, u.avatar_color, LENGTH(u.avatar_url) AS avatar_len, CRC32(u.avatar_url) AS avatar_crc,
            (SELECT COUNT(*) FROM status_views v WHERE v.status_id = s.id) AS view_count,
            EXISTS (SELECT 1 FROM status_views v WHERE v.status_id = s.id AND v.viewer_id = ?) AS viewed
     FROM statuses s JOIN users u ON u.id = s.user_id
     WHERE s.expires_at > ? AND s.user_id IN (${ph})
     ORDER BY s.created_at ASC`,
    [me.id, new Date(), ...ids]
  );

  const byUser = new Map();
  rows.forEach((r) => {
    const uid = String(r.user_id);
    if (!byUser.has(uid)) {
      byUser.set(uid, {
        user: { id: uid, name: r.name, avatarColor: r.avatar_color, avatarUrl: userAvatarFromRow({ ...r, id: r.user_id }) },
        items: []
      });
    }
    byUser.get(uid).items.push({
      id: String(r.id),
      kind: r.kind,
      text: r.text,
      bgColor: r.bg_color,
      createdAt: new Date(r.created_at).getTime(),
      viewed: uid === String(me.id) ? true : !!r.viewed,
      viewCount: uid === String(me.id) ? Number(r.view_count) : undefined
    });
  });

  const mine = byUser.get(String(me.id)) || null;
  byUser.delete(String(me.id));
  const contacts = [...byUser.values()]
    .map((g) => ({ ...g, allViewed: g.items.every((i) => i.viewed), latest: g.items[g.items.length - 1].createdAt }))
    // unseen first, then most recent
    .sort((a, b) => Number(a.allViewed) - Number(b.allViewed) || b.latest - a.latest);

  return Response.json({ mine, contacts });
}

// Post a status: { kind: "text" | "image", text, bgColor, fileData }
export async function POST(req) {
  const me = await getUserFromRequest(req);
  if (!me) return Response.json({ message: "Missing or invalid auth token." }, { status: 401 });
  await ensureSchema();

  const body = await req.json().catch(() => ({}));
  const kind = body.kind === "image" ? "image" : "text";
  const text = String(body.text || "").trim().slice(0, 700);
  const bgColor = /^#[0-9a-f]{6}$/i.test(body.bgColor || "") ? body.bgColor : "#00a884";
  let fileData = null;

  if (kind === "text") {
    if (!text) return Response.json({ message: "Write something for your status." }, { status: 400 });
  } else {
    fileData = String(body.fileData || "");
    if (!/^data:image\/(png|jpe?g|webp|gif);base64,/i.test(fileData)) {
      return Response.json({ message: "Please choose an image." }, { status: 400 });
    }
    if (fileData.length > MAX_IMAGE_CHARS) {
      return Response.json({ message: "That image is too large." }, { status: 400 });
    }
  }

  const now = Date.now();
  const [[{ n }]] = await pool.query("SELECT COUNT(*) AS n FROM statuses WHERE user_id = ? AND expires_at > ?", [me.id, new Date(now)]);
  if (n >= MAX_ACTIVE) return Response.json({ message: "You've reached the limit of active statuses." }, { status: 400 });

  const [result] = await pool.query(
    "INSERT INTO statuses (user_id, kind, text, bg_color, file_data, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [me.id, kind, text, bgColor, fileData, new Date(now), new Date(now + STATUS_TTL_MS)]
  );

  // Tell my contacts to refresh their status row (carries no content).
  try {
    (await getContactIds(me.id)).forEach((cid) => emitToUser(cid, "status-updated", { userId: String(me.id) }));
  } catch {
    /* live nudge is best-effort */
  }

  return Response.json({ id: String(result.insertId) }, { status: 201 });
}
