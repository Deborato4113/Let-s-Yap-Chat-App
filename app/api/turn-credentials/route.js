import { getUserFromRequest } from "@/lib/authServer";

// Serves fresh TURN/STUN credentials to the client for WebRTC calls. The
// Metered API key stays server-side (in METERED_API_KEY) - it's never sent to
// the browser, only the short-lived iceServers list their API hands back.
// Require login so this endpoint can't be used as a free open relay by
// randoms who find the URL.
export async function GET(req) {
  const me = await getUserFromRequest(req);
  if (!me) return Response.json({ message: "Missing or invalid auth token." }, { status: 401 });

  const apiKey = process.env.METERED_API_KEY;
  const appName = process.env.METERED_APP_NAME; // e.g. "lets_yap" from your metered.live URL

  if (!apiKey || !appName) {
    // No TURN provider configured - fall back to STUN-only so calls between
    // two peers on friendly networks (same LAN, no strict NAT) still work.
    return Response.json({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
    });
  }

  try {
    const res = await fetch(
      `https://${appName}.metered.live/api/v1/turn/credentials?apiKey=${apiKey}`
    );
    if (!res.ok) {
      console.error("Metered TURN credentials error:", res.status, await res.text());
      return Response.json({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
      });
    }
    const iceServers = await res.json();
    return Response.json({ iceServers });
  } catch (err) {
    console.error("Metered TURN credentials request failed:", err.message);
    return Response.json({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
    });
  }
}
