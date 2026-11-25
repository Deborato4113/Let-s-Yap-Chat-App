import { getUserFromRequest } from "@/lib/authServer";
import { getVapid } from "@/lib/webPush";

export async function GET(req) {
  const me = await getUserFromRequest(req);
  if (!me) return Response.json({ message: "Missing or invalid auth token." }, { status: 401 });
  const { publicKey } = await getVapid();
  return Response.json({ publicKey });
}
