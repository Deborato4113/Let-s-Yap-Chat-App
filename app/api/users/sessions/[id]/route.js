import { getUserFromRequest } from "@/lib/authServer";
import { revokeSession } from "@/lib/sessions";
import { disconnectUserSockets } from "@/lib/socketServer";

export async function DELETE(req, { params }) {
  const me = await getUserFromRequest(req);
  if (!me) return Response.json({ message: "Missing or invalid auth token." }, { status: 401 });
  const { id } = await params;
  const ok = await revokeSession(me.id, id);
  if (!ok) return Response.json({ message: "That device is already signed out." }, { status: 404 });
  // drop that device's live connection too (sockets of the other sessions reconnect nothing; they are still valid)
  disconnectUserSockets(me.id, null, id);
  return Response.json({ ok: true });
}
