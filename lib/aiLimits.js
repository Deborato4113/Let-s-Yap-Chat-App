// Tiny per-user rate limit for the AI helpers (Translate, Suggest replies, Voice to text).
const hits = globalThis.__yapAiHits || (globalThis.__yapAiHits = new Map());
export function aiRateLimited(userId, bucket, perMinute = 20) {
  const key = `${bucket}:${userId}`;
  const now = Date.now();
  const recent = (hits.get(key) || []).filter((t) => now - t < 60000);
  const limited = recent.length >= perMinute;
  if (!limited) recent.push(now);
  hits.set(key, recent);
  return limited;
}
