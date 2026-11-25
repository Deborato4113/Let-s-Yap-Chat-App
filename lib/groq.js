// Minimal Groq chat-completions client (OpenAI-compatible endpoint), used by
// the AI features (catch-me-up summaries, and later smart replies etc.).
// Server-side only: GROQ_API_KEY never reaches the browser.
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

export async function groqChat({
  messages,
  model = process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
  temperature = 0.3,
  maxTokens = 450,
  timeoutMs = 20000
}) {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("GROQ_API_KEY is not set.");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, messages, temperature, max_tokens: maxTokens }),
      signal: controller.signal
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Groq ${res.status}: ${body.slice(0, 200)}`);
    }
    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim() || "";
  } finally {
    clearTimeout(timer);
  }
}
