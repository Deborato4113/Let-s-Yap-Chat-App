import { verifyToken } from "./jwt";
import pool from "./db";

// Reads the Bearer token from a Next.js Request object and returns the
// logged-in user's raw DB row, or null if missing/invalid.
export async function getUserFromRequest(req) {
  const header = req.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return null;

  try {
    const decoded = verifyToken(token);
    const [rows] = await pool.query("SELECT * FROM users WHERE id = ? LIMIT 1", [decoded.id]);
    return rows[0] || null;
  } catch {
    return null;
  }
}
