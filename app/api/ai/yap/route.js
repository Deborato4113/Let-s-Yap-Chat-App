import { getUserFromRequest } from "@/lib/authServer";

// "Yap AI" - takes a message's text and returns a short, contextual take on
// it. Tries Google Gemini first (GEMINI_API_KEY - free tier, get one at
// https://aistudio.google.com/apikey), then Anthropic (ANTHROPIC_API_KEY -
// paid) if that's set instead, and otherwise falls back to a lightweight
// heuristic so the feature still works end-to-end with zero setup.
export async function POST(req) {
  const me = await getUserFromRequest(req);
  if (!me) return Response.json({ message: "Missing or invalid auth token." }, { status: 401 });

  const { text, type } = await req.json();
  const prompt = `Someone received this chat message: "${text || `(a ${type || "media"} message)`}". In 1-2 short, friendly sentences, suggest a good reply or reaction to it.`;

  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey) {
    const reply = await tryGemini(prompt, geminiKey);
    if (reply) return Response.json({ reply });
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (anthropicKey) {
    const reply = await tryAnthropic(prompt, anthropicKey);
    if (reply) return Response.json({ reply });
  }

  return Response.json({ reply: cannedReply(text, type) });
}

async function tryGemini(prompt, apiKey) {
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      }
    );
    if (!res.ok) {
      console.error("Yap AI (Gemini) upstream error:", res.status, await res.text());
      return null;
    }
    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
  } catch (err) {
    console.error("Yap AI (Gemini) request failed:", err.message);
    return null;
  }
}

async function tryAnthropic(prompt, apiKey) {
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-3-5-haiku-20241022",
        max_tokens: 200,
        messages: [{ role: "user", content: prompt }]
      })
    });
    if (!res.ok) {
      console.error("Yap AI (Anthropic) upstream error:", res.status, await res.text());
      return null;
    }
    const data = await res.json();
    return data.content?.[0]?.text?.trim() || null;
  } catch (err) {
    console.error("Yap AI (Anthropic) request failed:", err.message);
    return null;
  }
}

function cannedReply(text, type) {
  if (!text) {
    return `Nice ${type || "message"}! (Set GEMINI_API_KEY on the server for free real AI-generated replies here.)`;
  }
  const lower = text.toLowerCase();
  if (lower.includes("?")) return "That's a good question - worth following up on directly with them.";
  if (/(thanks|thank you)/.test(lower)) return "Sounds like a nice moment - a simple \"you're welcome!\" would fit well.";
  if (/(sorry|apolog)/.test(lower)) return "This reads like an apology - acknowledging it warmly usually helps.";
  return `Quick take on "${text.slice(0, 60)}${text.length > 60 ? "…" : ""}" - seems worth a short, friendly reply. (Set GEMINI_API_KEY on the server for free, smarter Yap AI replies.)`;
}
