import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import net from "node:net";

// Link previews: fetch a page SERVER-side and read its title / description /
// image. Because the server makes the request on a user's behalf, this is a
// classic SSRF target - so it only talks to public internet addresses
// (private, loopback and cloud-metadata ranges are refused, checked again at
// connect time and on every redirect), only on ports 80/443, with a short
// timeout and a small size cap.

const MAX_BYTES = 512 * 1024;
const TIMEOUT_MS = 8000;
const FAIL_TTL_MS = 60 * 1000;
const MAX_REDIRECTS = 3;
const CACHE_TTL_MS = 30 * 60 * 1000;

const cache = globalThis.__yapLinkCache || (globalThis.__yapLinkCache = new Map());
export function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
      (a === 169 && b === 254) || // link-local, incl. cloud metadata 169.254.169.254
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224 // multicast / reserved
    );
  }
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase();
    if (v === "::1" || v === "::") return true;
    if (v.startsWith("::ffff:")) return isPrivateIp(v.slice(7)); // IPv4-mapped
    return v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe8") || v.startsWith("fe9") || v.startsWith("fea") || v.startsWith("feb") || v.startsWith("ff");
  }
  return true; // not an IP we understand -> refuse
}

// Used as the socket's DNS lookup, so the address that is CHECKED is exactly
// the address that is CONNECTED to (no DNS-rebinding gap).
function safeLookup(hostname, options, callback) {
  dns.lookup(hostname, { ...(typeof options === "object" ? options : {}), all: true }, (err, addresses) => {
    if (err) return callback(err);
    const ok = addresses.filter((a) => !isPrivateIp(a.address));
    if (ok.length === 0) return callback(new Error("Blocked address"));
    if (typeof options === "object" && options.all) return callback(null, ok);
    callback(null, ok[0].address, ok[0].family);
  });
}

function fetchPage(urlStr, redirects = 0, browserUa = false) {
  return new Promise((resolve, reject) => {
    let url;
    try {
      url = new URL(urlStr);
    } catch {
      return reject(new Error("Bad URL"));
    }
    if (!["http:", "https:"].includes(url.protocol)) return reject(new Error("Bad protocol"));
    if (url.username || url.password) return reject(new Error("Credentials in URL"));
    if (url.port && !["80", "443"].includes(url.port)) return reject(new Error("Port not allowed"));
    const host = url.hostname.replace(/^\[|\]$/g, "");
    if (net.isIP(host) && isPrivateIp(host)) return reject(new Error("Blocked address"));
    if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal")) return reject(new Error("Blocked address"));

    const lib = url.protocol === "https:" ? https : http;
    const req = lib.request(
      url,
      {
        method: "GET",
        lookup: safeLookup,
        timeout: TIMEOUT_MS,
        headers: {
          "User-Agent": browserUa
            ? "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
            : "Mozilla/5.0 (compatible; LetsYapLinkPreview/1.0; +facebookexternalhit)",
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "en-US,en;q=0.9",
          "Accept-Encoding": "identity"
        }
      },
      (res) => {
        const status = res.statusCode || 0;
        if ([301, 302, 303, 307, 308].includes(status) && res.headers.location) {
          res.resume();
          if (redirects >= MAX_REDIRECTS) return reject(new Error("Too many redirects"));
          let next;
          try {
            next = new URL(res.headers.location, url).toString();
          } catch {
            return reject(new Error("Bad redirect"));
          }
          return fetchPage(next, redirects + 1, browserUa).then(resolve, reject);
        }
        const type = String(res.headers["content-type"] || "");
        if (status < 200 || status >= 300 || !/text\/html|application\/xhtml/i.test(type)) {
          res.resume();
          return reject(new Error("Not a web page"));
        }
        const chunks = [];
        let size = 0;
        res.on("data", (c) => {
          size += c.length;
          chunks.push(c);
          // the <head> is all we need; stop early
          if (size >= MAX_BYTES) req.destroy();
        });
        const done = () => resolve({ html: Buffer.concat(chunks).toString("utf8"), finalUrl: url.toString() });
        res.on("end", done);
        res.on("close", done);
        res.on("error", () => done());
      }
    );
    req.on("timeout", () => req.destroy(new Error("Timeout")));
    req.on("error", reject);
    req.end();
  });
}

function decodeEntities(s) {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Math.min(Number(n), 0x10ffff)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(Math.min(parseInt(n, 16), 0x10ffff)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .trim();
}

export function parsePreview(html, baseUrl) {
  const head = html.slice(0, 200 * 1024);
  const metas = {};
  for (const m of head.matchAll(/<meta\s+[^>]*>/gi)) {
    const tag = m[0];
    const key = /(?:property|name)\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase();
    const val = /content\s*=\s*"([^"]*)"|content\s*=\s*'([^']*)'/i.exec(tag);
    if (key && val && metas[key] === undefined) metas[key] = decodeEntities(val[1] ?? val[2] ?? "");
  }
  const titleTag = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(head)?.[1];
  const title = (metas["og:title"] || metas["twitter:title"] || (titleTag ? decodeEntities(titleTag.replace(/\s+/g, " ")) : "")).slice(0, 160);
  const description = (metas["og:description"] || metas["twitter:description"] || metas["description"] || "").slice(0, 300);
  let image = metas["og:image"] || metas["twitter:image"] || "";
  if (image) {
    try {
      const u = new URL(image, baseUrl);
      image = ["http:", "https:"].includes(u.protocol) ? u.toString() : "";
    } catch {
      image = "";
    }
  }
  let siteName = metas["og:site_name"] || "";
  if (!siteName) {
    try {
      siteName = new URL(baseUrl).hostname.replace(/^www\./, "");
    } catch {
      /* ignore */
    }
  }
  return { title, description, image, siteName };
}


// Shown when a site can't be read (login wall, bot block, timeout): a plain
// card with what we can tell from the address alone, so a pasted link never
// ends up with no card at all.
function fallbackPreview(target) {
  let u;
  try {
    u = new URL(target);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\./, "");
  if (host === "meet.google.com") {
    return {
      url: target,
      title: "Meet",
      description: "Real-time meetings by Google. Using your browser, share your video, desktop, and presentations with teammates and customers.",
      image: "https://fonts.gstatic.com/s/i/productlogos/meet_2020q4/v1/web-96dp/logo_meet_2020q4_color_2x_web_96dp.png",
      siteName: "meet.google.com"
    };
  }
  if (host === "zoom.us" || host.endsWith(".zoom.us")) {
    return { url: target, title: "Zoom meeting", description: "Tap to join the meeting", image: "", siteName: "Zoom" };
  }
  if (host === "teams.microsoft.com" || host === "teams.live.com") {
    return { url: target, title: "Microsoft Teams meeting", description: "Tap to join the meeting", image: "", siteName: "Microsoft Teams" };
  }
  const path = u.pathname === "/" ? "" : decodeURIComponent(u.pathname).slice(0, 80);
  return { url: target, title: host, description: path, image: "", siteName: host };
}

export async function getPreview(target) {
  if (!/^https?:\/\//i.test(target) || target.length > 2000) return null;
  const hit = cache.get(target);
  if (hit && Date.now() - hit.at < (hit.preview && !hit.fallback ? CACHE_TTL_MS : FAIL_TTL_MS)) return hit.preview;

  let preview = null;
  // Meeting links redirect to sign-in pages, so a fetch would only return a
  // "Sign in" title - use the address-based card directly.
  try {
    const h = new URL(target).hostname.replace(/^www\./, "");
    if (h === "meet.google.com" || h === "zoom.us" || h.endsWith(".zoom.us") || h === "teams.microsoft.com" || h === "teams.live.com") {
      preview = fallbackPreview(target);
      cache.set(target, { at: Date.now(), preview, fallback: false });
      return preview;
    }
  } catch {
    /* fall through */
  }
  for (const browserUa of [false, true]) {
    try {
      const { html, finalUrl } = await fetchPage(target, 0, browserUa);
      const p = parsePreview(html, finalUrl);
      if (p.title || p.description || p.image) {
        preview = { url: finalUrl, ...p };
        break;
      }
    } catch {
      /* try again with a browser-like identity, then fall back */
    }
  }
  const fallback = !preview;
  if (!preview) preview = fallbackPreview(target);
  if (cache.size > 500) cache.delete(cache.keys().next().value);
  cache.set(target, { at: Date.now(), preview, fallback });
  return preview;
}
