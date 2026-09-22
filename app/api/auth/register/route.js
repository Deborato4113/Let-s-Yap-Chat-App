import bcrypt from "bcryptjs";
import pool from "@/lib/db";
import { signToken } from "@/lib/jwt";
import { toPublicUser } from "@/lib/serialize";

const AVATAR_COLORS = [
  "#00A884", "#7F66FF", "#FF6B6B", "#4C9AFF", "#FFA94D",
  "#20C997", "#E64980", "#845EF7", "#15AABF", "#FAB005"
];

function pickColor(seed) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export async function POST(req) {
  try {
    let { username, email, password, name } = await req.json();
    username = (username || "").trim().toLowerCase();
    email = (email || "").trim().toLowerCase();
    name = (name || "").trim();

    if (!username || !email || !password || !name) {
      return Response.json({ message: "All fields are required." }, { status: 400 });
    }
    if (username.length < 3) {
      return Response.json({ message: "Username must be at least 3 characters." }, { status: 400 });
    }
    if (password.length < 6) {
      return Response.json({ message: "Password must be at least 6 characters." }, { status: 400 });
    }

    const [existingRows] = await pool.query(
      "SELECT id, username, email FROM users WHERE username = ? OR email = ? LIMIT 1",
      [username, email]
    );
    if (existingRows.length > 0) {
      const existing = existingRows[0];
      return Response.json(
        { message: existing.username === username ? "Username already taken." : "Email already registered." },
        { status: 409 }
      );
    }

    const hashed = await bcrypt.hash(password, 10);
    const avatarColor = pickColor(username);

    const [result] = await pool.query(
      `INSERT INTO users (username, email, password, name, avatar_color, status, last_seen)
       VALUES (?, ?, ?, ?, ?, 'online', NOW(3))`,
      [username, email, hashed, name, avatarColor]
    );

    const [rows] = await pool.query("SELECT * FROM users WHERE id = ?", [result.insertId]);
    const user = rows[0];

    const token = signToken({ id: user.id });
    return Response.json({ token, user: toPublicUser(user) }, { status: 201 });
  } catch (err) {
    console.error(err);
    return Response.json({ message: "Registration failed." }, { status: 500 });
  }
}
