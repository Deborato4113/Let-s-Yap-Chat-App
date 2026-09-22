import { getUserFromRequest } from "@/lib/authServer";
import { toPublicUser } from "@/lib/serialize";

export async function GET(req) {
  const user = await getUserFromRequest(req);
  if (!user) return Response.json({ message: "Missing or invalid auth token." }, { status: 401 });
  return Response.json({ user: toPublicUser(user) });
}
