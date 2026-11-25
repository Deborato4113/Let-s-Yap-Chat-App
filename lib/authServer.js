import { USER_COLS } from "./avatars.js";
import { verifyToken } from "./jwt";
import pool from "./db";
import { sessionIsValid } from "./sessions";

// Reads the Bearer token from a Next.js Request object and returns the
// logged-in user's raw DB row, or null if missing/invalid.
export async function getUserFromRequest(req) {
  const header = req.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    console.error(`Auth: no bearer token on ${req.method} ${req.url}`);
    return null;
  }

  try {
    const decoded = verifyToken(token);
    const [rows] = await pool.query(`SELECT ${USER_COLS} FROM users WHERE id = ? LIMIT 1`, [decoded.id]);
    if (!rows[0]) {
      console.error(`Auth: token valid but no user row for id ${decoded.id} (${req.method} ${req.url})`);
    }
    if (rows[0] && !(await sessionIsValid(decoded, rows[0]))) return null; // signed out from another device
    if (rows[0]) rows[0].sid = decoded.sid || null;
    return rows[0] || null;
  } catch (err) {
    // Surfaces WHY a token failed - expired, wrong secret (e.g. issued by a
    // different JWT_SECRET than this process currently has loaded), or just
    // malformed - instead of every failure looking identical as a plain 401.
    console.error(`Auth: token verify failed on ${req.method} ${req.url}:`, err.message);
    // Only a genuinely bad token (bad signature, expired, malformed) means
    // "not logged in" (401). A database/network failure while looking the
    // user up (ETIMEDOUT, ECONNRESET...) is NOT the user's fault - treating it
    // as 401 made the app think the login was invalid and kick people out
    // whenever the database blipped. Let it surface as a 500 instead.
    const isTokenProblem = ["JsonWebTokenError", "TokenExpiredError", "NotBeforeError"].includes(err.name);
    if (!isTokenProblem) throw err;
    return null;
  }
}
