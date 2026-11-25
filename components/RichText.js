"use client";

// Matches https://..., www.... and bare domains like meet.google.com/abc-defg-hij
// (not e-mail addresses).
const URL_SOURCE =
  "(?:https?:\\/\\/|www\\.)[^\\s<>\"']+|(?<![@\\w.-])(?:[a-z0-9-]+\\.)+(?:com|org|net|io|in|co|app|dev|me|ly|us|edu|gov|ai|tv|xyz|gle|zoom\\.us)(?![a-z0-9-])(?:[\\/?#][^\\s<>\"']*)?";

// Adds https:// to links typed without a scheme.
export function normalizeUrl(u) {
  return /^https?:\/\//i.test(u) ? u : `https://${u}`;
}
const TRAILING_PUNCT = /[.,;:!?)\]}'"]+$/;

// First http(s) link in a piece of text (without trailing punctuation).
export function extractFirstUrl(text) {
  if (!text) return null;
  const m = new RegExp(URL_SOURCE, "i").exec(text);
  return m ? normalizeUrl(m[0].replace(TRAILING_PUNCT, "")) : null;
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Message text with clickable links and highlighted @mentions.
//   members - people who can be mentioned ({ id, username })
//   meId    - the viewer; a mention of them gets a stronger highlight
export default function RichText({ text, members = [], meId }) {
  if (!text) return null;

  const names = members
    .filter((m) => m.username)
    .sort((a, b) => b.username.length - a.username.length) // longest first, so @anna doesn't swallow @annabel
    .map((m) => escapeRe(m.username));
  const byUsername = new Map(members.filter((m) => m.username).map((m) => [m.username.toLowerCase(), m]));

  const source = `(${URL_SOURCE})` + (names.length ? `|@(${names.join("|")})(?![A-Za-z0-9_])` : "");
  const re = new RegExp(source, "gi");

  const parts = [];
  let last = 0;
  let key = 0;
  for (const m of text.matchAll(re)) {
    const start = m.index;
    if (start > last) parts.push(text.slice(last, start));

    if (m[1]) {
      const raw = m[1];
      const url = raw.replace(TRAILING_PUNCT, "");
      parts.push(
        <a
          key={key++}
          href={normalizeUrl(url)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="text-[#53bdeb] underline break-all"
        >
          {url}
        </a>
      );
      if (url.length < raw.length) parts.push(raw.slice(url.length));
    } else {
      const person = byUsername.get(String(m[2]).toLowerCase());
      const mine = person && String(person.id) === String(meId);
      parts.push(
        <span
          key={key++}
          className={
            mine
              ? "font-semibold text-[var(--wa-green-dark)] bg-[var(--wa-green)]/20 rounded px-0.5"
              : "font-medium text-[var(--wa-green)]"
          }
        >
          {m[0]}
        </span>
      );
    }
    last = start + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}
