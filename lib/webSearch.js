// Free, keyless "grounding" for Yap AI: when a message looks like it needs
// current/factual info, scrape DuckDuckGo's plain HTML results (no API key,
// no billing - unlike Gemini's own Google Search grounding, which is billed
// per request even on a free-tier key) and hand the snippets to the model as
// context. Best-effort: any failure here just means Yap AI answers from its
// own knowledge instead, it never blocks the reply.

const TRIGGER_RE =
  /\b(who is|who's|who was|what is|what's|what are|when is|when did|when was|where is|latest|current|currently|today|right now|this year|this week|news|score|scores|result|results|price|prices|stock|weather|forecast|release date|releases|coming out|update on|updates on|happened to|how old is|net worth|election|winner|champion)\b/i;
const YEAR_RE = /\b(19|20)\d{2}\b/;

export function looksLikeSearchQuery(text) {
  if (!text) return false;
  return TRIGGER_RE.test(text) || YEAR_RE.test(text);
}

export async function searchWeb(query, limit = 4) {
  try {
    const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; YapAI/1.0)" }
    });
    if (!res.ok) return [];
    const html = await res.text();

    const results = [];
    const re =
      /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
    let match;
    while ((match = re.exec(html)) && results.length < limit) {
      results.push({
        url: cleanDuckDuckGoUrl(match[1]),
        title: stripTags(match[2]),
        snippet: stripTags(match[3])
      });
    }
    return results;
  } catch (err) {
    console.error("Yap AI web search failed:", err.message);
    return [];
  }
}

// DuckDuckGo's HTML result links are redirect wrappers like
// "//duckduckgo.com/l/?uddg=<encoded-real-url>&rut=..." - unwrap to the
// actual destination so the citation is a real, clickable URL.
function cleanDuckDuckGoUrl(href) {
  try {
    const url = new URL(href.startsWith("//") ? `https:${href}` : href, "https://duckduckgo.com");
    const real = url.searchParams.get("uddg");
    return real ? decodeURIComponent(real) : url.toString();
  } catch {
    return href;
  }
}

function stripTags(html) {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .trim();
}

export function formatSearchContext(results) {
  if (!results || results.length === 0) return null;
  return results.map((r, i) => `${i + 1}. ${r.title} — ${r.snippet} (${r.url})`).join("\n");
}
