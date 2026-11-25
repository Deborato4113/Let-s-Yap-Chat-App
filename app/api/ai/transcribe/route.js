import pool from "@/lib/db";
import { getUserFromRequest } from "@/lib/authServer";
import { hiddenByBlockSql } from "@/lib/blocking";
import { ensureSchema, notExpiredSql } from "@/lib/ensureSchema";
import { aiRateLimited } from "@/lib/aiLimits";

// Voice note -> text (Groq Whisper). The result is cached on the message so it is only paid for once.
// POST { messageId }  ->  { transcript }
const MAX_BYTES = 20 * 1024 * 1024;

export async function POST(req) {
  const me = await getUserFromRequest(req);
  if (!me) return Response.json({ message: "Missing or invalid auth token." }, { status: 401 });
  if (aiRateLimited(me.id, "transcribe", 15)) {
    return Response.json({ message: "Too many requests - try again in a minute." }, { status: 429 });
  }
  await ensureSchema();
  const body = await req.json().catch(() => ({}));
  const messageId = Number(body.messageId);
  if (!Number.isInteger(messageId)) return Response.json({ message: "Invalid message id." }, { status: 400 });

  const [rows] = await pool.query(
    `SELECT m.id, m.type, m.file_data, m.transcript
     FROM messages m
     JOIN conversation_participants cp ON cp.conversation_id = m.conversation_id AND cp.user_id = ?
     WHERE m.id = ? AND m.deleted_for_everyone = 0
       AND NOT EXISTS (SELECT 1 FROM message_deleted_for mdf WHERE mdf.message_id = m.id AND mdf.user_id = ?)
       ${hiddenByBlockSql("m")}
       ${notExpiredSql("m")}`,
    [me.id, messageId, me.id, me.id, me.id, me.id]
  );
  const m = rows[0];
  if (!m) return Response.json({ message: "Message not found." }, { status: 404 });
  if (m.type !== "audio" || !m.file_data) return Response.json({ message: "That isn't a voice message." }, { status: 400 });
  if (m.transcript) return Response.json({ transcript: m.transcript, cached: true });

  const groqKey = process.env.GROQ_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!groqKey && !geminiKey) {
    return Response.json({ message: "Voice to text isn't set up on this server (add GROQ_API_KEY or GEMINI_API_KEY)." }, { status: 503 });
  }

  const parsed = /^data:([^;,]+)(?:;[^,]*)?;base64,(.*)$/s.exec(m.file_data);
  if (!parsed) return Response.json({ message: "Couldn't read that voice message." }, { status: 422 });
  const mime = parsed[1];
  const bytes = Buffer.from(parsed[2], "base64");
  if (bytes.length > MAX_BYTES) return Response.json({ message: "That voice message is too long to convert." }, { status: 413 });
  const ext = /ogg/.test(mime) ? "ogg" : /mp4|m4a|aac/.test(mime) ? "m4a" : /mpeg|mp3/.test(mime) ? "mp3" : /wav/.test(mime) ? "wav" : "webm";

  // Groq Whisper first, then Google Gemini as the second option.
  let transcript = null;
  if (groqKey) transcript = await viaGroq(groqKey, bytes, mime, ext);
  if (transcript === null && geminiKey) transcript = await viaGemini(geminiKey, bytes, mime);

  try {
    if (transcript === null) throw new Error("All speech-to-text providers failed.");
    if (!transcript) return Response.json({ transcript: "", empty: true });
    await pool.query("UPDATE messages SET transcript = ? WHERE id = ?", [transcript.slice(0, 20000), m.id]);
    return Response.json({ transcript });
  } catch (err) {
    console.error("Transcribe failed:", err.message);
    return Response.json({ message: "Voice to text isn't available right now. Try again shortly." }, { status: 502 });
  }
}

async function viaGroq(key, bytes, mime, ext) {
  try {
    const form = new FormData();
    form.append("file", new Blob([bytes], { type: mime }), `voice.${ext}`);
    form.append("model", "whisper-large-v3-turbo");
    form.append("response_format", "json");
    form.append("temperature", "0");
    const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: form,
      signal: AbortSignal.timeout(60000)
    });
    if (!res.ok) throw new Error(`${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    return String(data.text || "").trim();
  } catch (err) {
    console.error("Transcribe (Groq) failed:", err.message);
    return null;
  }
}

const GEMINI_MODELS = ["gemini-flash-latest", "gemini-3.6-flash"];

async function viaGemini(key, bytes, mime) {
  const cleanMime = mime.split(";")[0];
  for (const model of GEMINI_MODELS) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contents: [{
            role: "user",
            parts: [
              { text: "Transcribe this voice message exactly as spoken, in the language spoken. Output only the transcript text. If there is no speech, output nothing." },
              { inlineData: { mimeType: cleanMime, data: bytes.toString("base64") } }
            ]
          }]
        }),
        signal: AbortSignal.timeout(60000)
      });
      if (!res.ok) {
        console.error(`Transcribe (Gemini/${model}) error:`, res.status, (await res.text()).slice(0, 200));
        continue;
      }
      const data = await res.json();
      return String(data.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "").trim();
    } catch (err) {
      console.error(`Transcribe (Gemini/${model}) failed:`, err.message);
    }
  }
  return null;
}
