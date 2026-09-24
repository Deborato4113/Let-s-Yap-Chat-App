import pool from "@/lib/db";
import { verifyFirebaseIdToken } from "@/lib/firebaseAdmin";
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

async function usernameTaken(username) {
  const [rows] = await pool.query("SELECT 1 FROM users WHERE username = ? LIMIT 1", [username]);
  return rows.length > 0;
}

async function uniqueUsernameFrom(seed) {
  const base = (seed || "user").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 18) || "user";
  let candidate = base;
  let n = 0;
  while (await usernameTaken(candidate)) {
    n += 1;
    candidate = `${base}${n}`;
  }
  return candidate;
}

// Exchanges a Firebase ID token (from Google or Firebase email/password
// sign-in on the client) for this app's own JWT, so everything downstream -
// API routes, socket auth - keeps working exactly as it does for regular
// username/password accounts.
export async function POST(req) {
  try {
    const { idToken } = await req.json();
    if (!idToken) return Response.json({ message: "Missing idToken." }, { status: 400 });

    let decoded;
    try {
      decoded = await verifyFirebaseIdToken(idToken);
    } catch (err) {
      console.error("Firebase token verification failed:", err.message);
      return Response.json({ message: "Invalid or expired sign-in. Please try again." }, { status: 401 });
    }

    const { uid, email, name, picture } = decoded;

    // 1. Already linked to a local account.
    let [rows] = await pool.query("SELECT * FROM users WHERE firebase_uid = ? LIMIT 1", [uid]);
    let user = rows[0];

    // 2. Not linked yet, but an account with this email already exists
    //    (e.g. they originally signed up with username/password) - link it
    //    rather than creating a duplicate account.
    if (!user && email) {
      [rows] = await pool.query("SELECT * FROM users WHERE email = ? LIMIT 1", [email]);
      if (rows[0]) {
        await pool.query("UPDATE users SET firebase_uid = ? WHERE id = ?", [uid, rows[0].id]);
        user = { ...rows[0], firebase_uid: uid };
      }
    }

    // 3. Brand new user.
    if (!user) {
      const emailForRecord = email || `${uid}@firebase.letsyap`;
      const username = await uniqueUsernameFrom(email ? email.split("@")[0] : name);
      const displayName = (name || email?.split("@")[0] || "New user").slice(0, 40);
      const avatarColor = pickColor(uid);

      const [result] = await pool.query(
        `INSERT INTO users (username, email, password, firebase_uid, name, avatar_color, avatar_url, status, last_seen)
         VALUES (?, ?, NULL, ?, ?, ?, ?, 'online', NOW(3))`,
        [username, emailForRecord, uid, displayName, avatarColor, picture || null]
      );
      [rows] = await pool.query("SELECT * FROM users WHERE id = ?", [result.insertId]);
      user = rows[0];
    } else {
      await pool.query("UPDATE users SET status = 'online', last_seen = NOW(3) WHERE id = ?", [user.id]);
      user.status = "online";
    }

    const token = signToken({ id: user.id });
    return Response.json({ token, user: toPublicUser(user) });
  } catch (err) {
    console.error("Firebase auth error:", err);
    return Response.json({ message: "Sign-in failed. Please try again." }, { status: 500 });
  }
}
