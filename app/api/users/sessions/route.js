import { getUserFromRequest } from "@/lib/authServer";
import { listSessions } from "@/lib/sessions";

export async function GET(req) {
  const me = await getUserFromRequest(req);
  if (!me) return Response.json({ message: "Missing or invalid auth token." }, { status: 401 });
  const rows = await listSessions(me.id);
  return Response.json({
    sessions: rows.map((r) => ({
      id: r.id,
      device: r.device,
      ip: r.ip,
      createdAt: new Date(r.created_at).getTime(),
      lastActive: new Date(r.last_active).getTime(),
      current: r.id === me.sid
    })),
    // sessions from before this feature can't be listed, only ended with "log out everywhere"
    hasLegacy: !me.sid
  });
}
