import pool from "@/lib/db";
import { getUserFromRequest } from "@/lib/authServer";
import { hiddenByBlockSql } from "@/lib/blocking";
import { ensureSchema, notExpiredSql } from "@/lib/ensureSchema";
import { aiRateLimited } from "@/lib/aiLimits";

// Read the text in a photo, or describe it.  POST { messageId, mode: "text" | "describe" }  ->  { result }
// View-once photos are never read.
const PROMPTS = {
  text: "Extract all the text visible in this image exactly as written, keeping the line breaks. Output only that text. If there is no readable text, output exactly: NO_TEXT",
  describe: "Describe this image in one or two short, plain sentences, the way you would alt text for a screen reader. Output only the description."
};
const GEMINI_MODELS = ["gemini-flash-latest", "gemini-3.6-flash"];
const MAX_BYTES = 4 * 1024 * 1024;

export async function POST(req) {
  const me = await getUserFromRequest(req);
  if (!me) return Response.json({ message: "Missing or invalid auth token." }, { status: 401 });
  if (aiRateLimited(me.id, "image", 15)) return Response.json({ message: "Too many requests - try again in a minute." }, { status: 429 });
  await ensureSchema();
  const body = await req.json().catch(() => ({}));
  const messageId = Number(body.messageId);
  const prompt = PROMPTS[body.mode];
  if (!Number.isInteger(messageId)) return Response.json({ message: "Invalid message id." }, { status: 400 });
  if (!prompt) return Response.json({ message: "mode must be text or describe." }, { status: 400 });

  const [rows] = await pool.query(
    `SELECT m.type, m.file_data
     FROM messages m
     JOIN conversation_participants cp ON cp.conversation_id = m.conversation_id AND cp.user_id = ?
     WHERE m.id = ? AND m.deleted_for_everyone = 0 AND m.view_once = 0
       AND NOT EXISTS (SELECT 1 FROM message_deleted_for mdf WHERE mdf.message_id = m.id AND mdf.user_id = ?)
       ${hiddenByBlockSql("m")}
       ${notExpiredSql("m")}`,
    [me.id, messageId, me.id, me.id, me.id, me.id]
  );
  const m = rows[0];
  if (!m) return Response.json({ message: "Message not found." }, { status: 404 });
  if (m.type !== "image" || !m.file_data) return Response.json({ message: "That isn't a photo." }, { status: 400 });
  const parsed = /^data:(image\/[a-z0-9.+-]+);base64,(.*)$/is.exec(m.file_data);
  if (!parsed) return Response.json({ message: "Couldn't read that photo." }, { status: 422 });
  const bytes = Buffer.from(parsed[2], "base64");
  if (bytes.length > MAX_BYTES) return Response.json({ message: "That photo is too large to read." }, { status: 413 });

  const groqKey = process.env.GROQ_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!groqKey && !geminiKey) {
    return Response.json({ message: "Reading photos isn't set up on this server (add GEMINI_API_KEY or GROQ_API_KEY)." }, { status: 503 });
  }

  let result = null;
  if (geminiKey) result = await viaGemini(geminiKey, parsed[1], parsed[2], prompt);
  if (result === null && groqKey) result = await viaGroq(groqKey, parsed[1], parsed[2], prompt);
  if (result === null) return Response.json({ message: "Reading this photo isn't available right now. Try again shortly." }, { status: 502 });
  if (body.mode === "text" && (!result || /^NO_TEXT\b/.test(result))) return Response.json({ result: "", empty: true });
  return Response.json({ result });
}

async function viaGemini(key, mime, b64, prompt) {
  for (const model of GEMINI_MODELS) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }, { inlineData: { mimeType: mime, data: b64 } }] }] }),
        signal: AbortSignal.timeout(45000)
      });
      if (!res.ok) { console.error(`Image (Gemini/${model}) error:`, res.status, (await res.text()).slice(0, 200)); continue; }
      const data = await res.json();
      return String(data.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "").trim();
    } catch (err) {
      console.error(`Image (Gemini/${model}) failed:`, err.message);
    }
  }
  return null;
}

async function viaGroq(key, mime, b64, prompt) {
  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: "meta-llama/llama-4-scout-17b-16e-instruct",
        temperature: 0,
        messages: [{ role: "user", content: [{ type: "text", text: prompt }, { type: "image_url", image_url: { url: `data:${mime};base64,${b64}` } }] }]
      }),
      signal: AbortSignal.timeout(45000)
    });
    if (!res.ok) throw new Error(`${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    return String(data.choices?.[0]?.message?.content || "").trim();
  } catch (err) {
    console.error("Image (Groq) failed:", err.message);
    return null;
  }
}
