import pool from "@/lib/db";
import { getUserFromRequest } from "@/lib/authServer";
import { toPublicUser } from "@/lib/serialize";

export async function GET(req) {
  const user = await getUserFromRequest(req);
  if (!user) return Response.json({ message: "Missing or invalid auth token." }, { status: 401 });
  const [rows] = await pool.query("SELECT * FROM users WHERE id = ?", [user.id]);
  if (!rows[0]) return Response.json({ message: "User not found." }, { status: 404 });
  return Response.json({ user: toPublicUser(rows[0]) });
}

export async function PATCH(req) {
  const user = await getUserFromRequest(req);
  if (!user) return Response.json({ message: "Missing or invalid auth token." }, { status: 401 });

  const { name, bio, avatarColor, avatarUrl, theme, darkMode } = await req.json();
  const fields = [];
  const values = [];

  if (typeof name === "string" && name.trim()) {
    fields.push("name = ?");
    values.push(name.trim().slice(0, 40));
  }
  if (typeof bio === "string") {
    fields.push("bio = ?");
    values.push(bio.slice(0, 140));
  }
  if (typeof avatarColor === "string" && avatarColor) {
    fields.push("avatar_color = ?");
    values.push(avatarColor);
  }
  if (typeof avatarUrl === "string") {
    // Same 5MB cap as chat attachments - profile photos ride the same base64-in-column pattern.
    if (avatarUrl.length > 7 * 1024 * 1024) {
      return Response.json({ message: "Profile photo is too large (max 5MB)." }, { status: 400 });
    }
    fields.push("avatar_url = ?");
    values.push(avatarUrl);
  }
  if (typeof theme === "string" && theme) {
    fields.push("theme = ?");
    values.push(theme.slice(0, 20));
  }
  if (typeof darkMode === "boolean") {
    fields.push("dark_mode = ?");
    values.push(darkMode ? 1 : 0);
  }

  if (fields.length > 0) {
    values.push(user.id);
    await pool.query(`UPDATE users SET ${fields.join(", ")} WHERE id = ?`, values);
  }

  const [rows] = await pool.query("SELECT * FROM users WHERE id = ?", [user.id]);
  return Response.json({ user: toPublicUser(rows[0]) });
}
