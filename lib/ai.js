// Shared AI text-generation helper for Yap AI. Tries Groq first (GROQ_API_KEY
// - free, no card, get one at https://console.groq.com/keys - a completely
// separate company/infrastructure from Google, so it's unaffected by Gemini's
// own outages/rate limits), then Gemini (GEMINI_API_KEY - also free) as a
// backup, then Anthropic (ANTHROPIC_API_KEY - paid) if that's set instead,
// and otherwise falls back to a canned reply so the feature never hard-fails.
const SYSTEM_PROMPT =
  "You are Yap AI, a helpful, friendly AI assistant built into the Let's Yap chat app - " +
  "the same kind of role Meta AI plays inside WhatsApp. You chat naturally and " +
  "conversationally: answer questions, help draft or improve replies, explain things, " +
  "brainstorm, translate, summarize, whatever's asked. Keep answers reasonably concise " +
  "unless the person is clearly asking for something detailed. You have no memory beyond " +
  "the messages shown to you in this conversation.";

// history: [{ role: "user" | "assistant", text: string }, ...] oldest first
// searchContext: optional string of fresh web-search snippets (see
// lib/webSearch.js) to ground the latest message in current information.
export async function getAiReply(history, searchContext = null) {
  const systemPrompt = searchContext
    ? `${SYSTEM_PROMPT}\n\nHere is fresh information from a live web search that may help with the latest message. Use it naturally where it's relevant, and don't feel obligated to mention it's from a search unless that's useful context:\n${searchContext}`
    : SYSTEM_PROMPT;

  const groqKey = process.env.GROQ_API_KEY;
  if (groqKey) {
    const reply = await tryGroq(history, groqKey, systemPrompt);
    if (reply) return reply;
  }

  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey) {
    const reply = await tryGemini(history, geminiKey, systemPrompt);
    if (reply) return reply;
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (anthropicKey) {
    const reply = await tryAnthropic(history, anthropicKey, systemPrompt);
    if (reply) return reply;
  }

  return cannedReply(history);
}

// Groq hosts open models (Llama, etc.) behind an OpenAI-compatible chat
// completions API - fast and genuinely free. Hardcoded model names keep
// getting retired/renamed (both Groq's and Google's own lineups have shifted
// under us this same session), so instead of guessing another name, ask
// Groq's own /models endpoint what's actually available on this key and use
// whatever that says - self-correcting if they rename things again later.
// Cached briefly so every message doesn't re-fetch the list.
let cachedGroqModel = null;
let cachedGroqModelAt = 0;

async function pickGroqModel(apiKey) {
  if (cachedGroqModel && Date.now() - cachedGroqModelAt < 10 * 60 * 1000) return cachedGroqModel;
  try {
    const res = await fetch("https://api.groq.com/openai/v1/models", {
      headers: { authorization: `Bearer ${apiKey}` }
    });
    if (!res.ok) {
      console.error("Yap AI (Groq) model list error:", res.status, await res.text());
      return null;
    }
    const data = await res.json();
    const ids = (data.data || []).map((m) => m.id);
    console.error("Yap AI (Groq) available models:", ids.join(", ") || "(none)");

    // Exclude anything that isn't a general chat/instruct model: audio
    // (whisper/orpheus/tts), moderation-only classifiers (guard/safeguard),
    // and prompt-injection detectors (prompt-guard) all show up in this list
    // alongside real chat models, but none of them can hold a conversation.
    const NON_CHAT_RE = /whisper|guard|tts|prompt-guard|orpheus|safeguard/i;
    const chatCandidates = ids.filter((id) => !NON_CHAT_RE.test(id));

    // Among the actual chat models, prefer the biggest/strongest general
    // model we recognize by name rather than whatever happened to come
    // first in the API's response order.
    const QUALITY_PRIORITY = [/gpt-oss-120b/i, /gpt-oss-20b/i, /llama.*70b/i, /qwen/i, /llama/i, /gemma/i, /mixtral/i];
    const picked =
      QUALITY_PRIORITY.map((re) => chatCandidates.find((id) => re.test(id))).find(Boolean) ||
      chatCandidates[0] ||
      ids[0] ||
      null;
    if (picked) {
      cachedGroqModel = picked;
      cachedGroqModelAt = Date.now();
    }
    return picked;
  } catch (err) {
    console.error("Yap AI (Groq) model list request failed:", err.message);
    return null;
  }
}

async function tryGroq(history, apiKey, systemPrompt) {
  const model = await pickGroqModel(apiKey);
  if (!model) return null;
  return tryGroqModel(history, apiKey, systemPrompt, model);
}

async function tryGroqModel(history, apiKey, systemPrompt, model, attempt = 1) {
  try {
    const messages = [
      { role: "system", content: systemPrompt },
      ...history.map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.text }))
    ];
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({ model, messages, max_tokens: 500 })
    });
    if (!res.ok) {
      const body = await res.text();
      console.error(`Yap AI (Groq/${model}) upstream error:`, res.status, body);
      if ((res.status === 429 || res.status === 503) && attempt < 2) {
        await new Promise((r) => setTimeout(r, 1500));
        return tryGroqModel(history, apiKey, systemPrompt, model, attempt + 1);
      }
      // The cached pick turned out to be gone (e.g. retired mid-cache-window)
      // - clear it so the very next message re-checks the model list instead
      // of repeating the same dead name for up to 10 more minutes.
      if (res.status === 404) cachedGroqModel = null;
      return null;
    }
    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim() || null;
  } catch (err) {
    console.error(`Yap AI (Groq/${model}) request failed:`, err.message);
    return null;
  }
}

// Google periodically retires specific dated model IDs (that's what broke
// "gemini-1.5-flash" - a 404 "not found for API version v1beta" - and later
// "gemini-2.5-flash"/"gemini-2.0-flash", confirmed permanently gone now, both
// pointing callers to "gemini-3.6-flash"). Only the two names that actually
// still resolve are worth trying - "-latest" auto-points at whatever Google
// currently considers current, and the pinned name is belt-and-suspenders in
// case the alias is ever slow to update.
const GEMINI_MODELS = ["gemini-flash-latest", "gemini-3.6-flash"];

async function tryGemini(history, apiKey, systemPrompt) {
  for (const model of GEMINI_MODELS) {
    const reply = await tryGeminiModel(history, apiKey, systemPrompt, model);
    if (reply) return reply;
  }
  return null;
}

async function tryGeminiModel(history, apiKey, systemPrompt, model, attempt = 1) {
  try {
    const contents = history.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.text }]
    }));
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents
        })
      }
    );
    if (!res.ok) {
      const body = await res.text();
      console.error(`Yap AI (Gemini/${model}) upstream error:`, res.status, body);
      // 503 is Google's own "temporary" high-demand signal - worth one quick
      // retry on the same model before moving on, rather than treating it
      // the same as a permanent 404.
      if (res.status === 503 && attempt < 2) {
        await new Promise((r) => setTimeout(r, 1500));
        return tryGeminiModel(history, apiKey, systemPrompt, model, attempt + 1);
      }
      return null;
    }
    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
  } catch (err) {
    console.error(`Yap AI (Gemini/${model}) request failed:`, err.message);
    return null;
  }
}

async function tryAnthropic(history, apiKey, systemPrompt) {
  try {
    const messages = history.map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.text
    }));
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-3-5-haiku-20241022",
        max_tokens: 500,
        system: systemPrompt,
        messages
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

function cannedReply(history) {
  const last = history[history.length - 1]?.text || "";
  const trimmed = last.length > 60 ? `${last.slice(0, 60)}…` : last;
  return (
    `Hey, I'm Yap AI! I'd love to give you a real answer here, but no AI provider is ` +
    `working right now - set GROQ_API_KEY (free, from https://console.groq.com/keys) or ` +
    `GEMINI_API_KEY (free, from https://aistudio.google.com/apikey) on the server so I can ` +
    `actually respond to things like "${trimmed}".`
  );
}
