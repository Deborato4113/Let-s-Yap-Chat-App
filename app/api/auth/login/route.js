import bcrypt from "bcryptjs";
import pool from "@/lib/db";
import { signToken } from "@/lib/jwt";
import { toPublicUser } from "@/lib/serialize";

export async function POST(req) {
  try {
    let { identifier, password } = await req.json();
    identifier = (identifier || "").trim().toLowerCase();
    if (!identifier || !password) {
      return Response.json({ message: "Username/email and password are required." }, { status: 400 });
    }

    const [rows] = await pool.query(
      "SELECT * FROM users WHERE username = ? OR email = ? LIMIT 1",
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

    const token = signToken({ id: user.id });
    return Response.json({ token, user: toPublicUser(user) });
  } catch (err) {
    console.error(err);
    return Response.json({ message: "Login failed." }, { status: 500 });
  }
}
