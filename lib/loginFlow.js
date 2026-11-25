import jwt from "jsonwebtoken";
import { issueToken } from "./sessions";
import { toPublicUser } from "./serialize";

const SECRET = process.env.JWT_SECRET || "dev-secret-change-me";

export function signChallenge(userId) {
  return jwt.sign({ id: userId, purpose: "2fa" }, SECRET, { expiresIn: "5m" });
}

export function verifyChallenge(token) {
  const d = jwt.verify(token, SECRET);
  if (d.purpose !== "2fa") throw new Error("Wrong token type");
  return d;
}

// Called after the password (or Google) check passed. If the account has
// two-step verification on, the person gets a challenge instead of a login.
export async function finishLogin(user, req, status = 200) {
  if (user.totp_enabled) {
    return Response.json({ twoFactorRequired: true, challenge: signChallenge(user.id) }, { status });
  }
  const token = await issueToken(user, req);
  return Response.json({ token, user: toPublicUser(user) }, { status });
}

// very small in-memory brake on guessing codes
const fails = globalThis.__yapTwoFaFails || (globalThis.__yapTwoFaFails = new Map());
export function tooManyAttempts(key, limit = 6, windowMs = 10 * 60 * 1000) {
  const now = Date.now();
  const list = (fails.get(key) || []).filter((t) => now - t < windowMs);
  fails.set(key, list);
  return list.length >= limit;
}
export function recordFailure(key) { fails.set(key, [...(fails.get(key) || []), Date.now()]); }
export function clearFailures(key) { fails.delete(key); }
