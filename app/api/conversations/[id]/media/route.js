import pool from "@/lib/db";
import { getUserFromRequest } from "@/lib/authServer";
import { visibleScope } from "@/lib/visibleScope";

const PAGE = 30;

// "Media, links and docs" for one chat.  ?kind=media|docs|links  &before=<messageId>
export async function GET(req, { params }) {
  const me = await getUserFromRequest(req);
  if (!me) return Response.json({ message: "Missing or invalid auth token." }, { status: 401 });
  const conversationId = Number((await params).id);
  if (!Number.isInteger(conversationId)) return Response.json({ message: "Invalid conversation id." }, { status: 400 });

  const url = new URL(req.url);
  const kind = url.searchParams.get("kind");
  const before = Number(url.searchParams.get("before")) || 0;
  const typeSql =
    kind === "media" ? "AND m.type IN ('image', 'video', 'audio')"
    : kind === "docs" ? "AND m.type = 'file'"
    : kind === "links" ? "AND m.type = 'text' AND m.text REGEXP 'https?://'"
    : null;
  if (!typeSql) return Response.json({ message: "kind must be media, docs or links." }, { status: 400 });

  const scope = await visibleScope(me.id, conversationId);
  if (!scope) return Response.json({ message: "Conversation not found." }, { status: 404 });

  const [rows] = await pool.query(
    `SELECT m.id, m.type, m.text, m.file_name, ${kind === "links" ? "''" : "IF(LENGTH(m.file_data) <= 150000, m.file_data, '')"} AS file_data, ${kind === "links" ? "0" : "LENGTH(m.file_data)"} AS file_size, m.timestamp, m.sender_id, u.name AS sender_name
     FROM messages m JOIN users u ON u.id = m.sender_id
     WHERE ${scope.where} AND m.view_once = 0 ${typeSql} ${before ? "AND m.id < ?" : ""}
     ORDER BY m.id DESC LIMIT ${PAGE + 1}`,
    before ? [...scope.params, before] : scope.params
  );
  const more = rows.length > PAGE;
  const items = rows.slice(0, PAGE).map((r) => {
    const base = {
      id: String(r.id),
      type: r.type,
      timestamp: new Date(r.timestamp).getTime(),
      senderId: String(r.sender_id),
      senderName: r.sender_name
    };
    if (kind === "links") {
      const urls = [...new Set((r.text || "").match(/https?:\/\/[^\s<>"']+/g) || [])].map((u) => u.replace(/[.,;:!?)\]]+$/, ""));
      return { ...base, text: r.text || "", urls };
    }
    return { ...base, fileName: r.file_name || "", fileData: r.file_data || "", fileLazy: Number(r.file_size) > 150000 };
  });
  return Response.json({ items, more });
}
