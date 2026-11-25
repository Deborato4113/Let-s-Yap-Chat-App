import { getUserFromRequest } from "@/lib/authServer";
import { getPreview } from "@/lib/linkPreview";

export const runtime = "nodejs";

const hits = globalThis.__yapLinkHits || (globalThis.__yapLinkHits = new Map());

function rateLimited(userId) {
  const now = Date.now();
  const recent = (hits.get(userId) || []).filter((t) => now - t < 60000);
  if (recent.length >= 40) {
    hits.set(userId, recent);
    return true;
  }
  recent.push(now);
  hits.set(userId, recent);
  return false;
}

export async function GET(req) {
  const me = await getUserFromRequest(req);
  if (!me) return Response.json({ message: "Missing or invalid auth token." }, { status: 401 });
  if (rateLimited(me.id)) return Response.json({ message: "Too many requests." }, { status: 429 });

  const target = new URL(req.url).searchParams.get("url") || "";
  return Response.json({ preview: await getPreview(target) });
}
