import { getUserFromRequest } from "@/lib/authServer";
import { revokeAllSessions, issueToken } from "@/lib/sessions";
import { disconnectUserSockets } from "@/lib/socketServer";

// Signs out every other device. This device stays signed in; a device still on an
// old-style token gets a fresh one back. Pass { includeThisDevice: true } to sign out here too.
export async function POST(req) {
  const me = await getUserFromRequest(req);
  if (!me) return Response.json({ message: "Missing or invalid auth token." }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const keepSid = !body.includeThisDevice && me.sid ? me.sid : null;
  await revokeAllSessions(me.id, keepSid);
  disconnectUserSockets(me.id, keepSid);
  if (body.includeThisDevice) return Response.json({ ok: true, signedOut: true });
  if (me.sid) return Response.json({ ok: true });
  return Response.json({ ok: true, token: await issueToken(me, req) });
}
