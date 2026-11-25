import pool from "./db.js";
import { ensureSchema } from "./ensureSchema.js";

// Live toxicity moderation. NEVER on the delivery path: the message is saved
// and broadcast first; this runs afterwards in the background, stores the
// score, and - only if the message is flagged - tells the room so receivers'
// copies get blurred. If the ML service is down or slow, nothing breaks: the
// message simply stays unflagged (fail-open).
//
// Env:
//   ML_SERVICE_URL     e.g. http://localhost:8001   (unset = moderation off)
//   ML_SERVICE_KEY     shared secret for the service (X-API-Key)
//   TOXICITY_THRESHOLD flag at or above this score (default 0.8) - pick it
//                      from the threshold sweep in ml-service/eval
export const TOXICITY_THRESHOLD = Number(process.env.TOXICITY_THRESHOLD || 0.8);
const TIMEOUT_MS = 2500;

export async function scoreText(text) {
  const base = process.env.ML_SERVICE_URL;
  if (!base) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${base.replace(/\/$/, "")}/score`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": process.env.ML_SERVICE_KEY || "" },
      body: JSON.stringify({ texts: [text] }),
      signal: controller.signal
    });
    if (!res.ok) return null;
    const data = await res.json();
    const toxicity = data?.scores?.[0]?.toxicity;
    return typeof toxicity === "number" ? toxicity : null;
  } catch {
    return null; // timeout / service down -> fail open
  } finally {
    clearTimeout(timer);
  }
}

// Call without `await` from the send-message handler:
//   moderateMessage({ messageId, conversationId, text, emitToConversation });
export async function moderateMessage({ messageId, conversationId, text, emitToConversation }) {
  try {
    if (!process.env.ML_SERVICE_URL || !text || text.trim().length < 3) return;
    const score = await scoreText(text);
    if (score === null) return;

    await ensureSchema();
    const flagged = score >= TOXICITY_THRESHOLD ? 1 : 0;
    await pool.query("UPDATE messages SET toxicity_score = ?, flagged = ? WHERE id = ?", [score, flagged, messageId]);

    if (flagged) {
      emitToConversation("message-flagged", {
        id: String(messageId),
        conversation: String(conversationId),
        flagged: true
      });
    }
  } catch (err) {
    console.error("Moderation failed:", err.message);
  }
}
