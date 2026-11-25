import { USER_COLS } from "@/lib/avatars";
import bcrypt from "bcryptjs";
import pool from "@/lib/db";
import { finishLogin } from "@/lib/loginFlow";

export async function POST(req) {
  try {
    let { identifier, password } = await req.json();
    identifier = (identifier || "").trim().toLowerCase();
    if (!identifier || !password) {
      return Response.json({ message: "Username/email and password are required." }, { status: 400 });
    }

    const [rows] = await pool.query(
      `SELECT ${USER_COLS} FROM users WHERE username = ? OR email = ? LIMIT 1`,
      [identifier, identifier]
    );
    const user = rows[0];
    if (!user) return Response.json({ message: "Invalid credentials." }, { status: 401 });

    if (!user.password) {
      return Response.json(
        { message: "This account uses Google/email sign-in. Use the \"continue with\" options below." },
        { status: 400 }
      );
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) return Response.json({ message: "Invalid credentials." }, { status: 401 });

    await pool.query("UPDATE users SET status = 'online', last_seen = NOW(3) WHERE id = ?", [user.id]);
    user.status = "online";

    return finishLogin(user, req);
  } catch (err) {
    console.error(err);
    return Response.json({ message: "Login failed." }, { status: 500 });
  }
}
