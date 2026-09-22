import pool from "./db.js";

// Attaches sender info + readBy/deliveredTo id arrays to a batch of raw
// message rows (each row must include sender_username/sender_name/sender_avatar_color
// from a join, see the SELECT in conversations/[id]/messages/route.js and socketServer.js).
export async function attachReadAndDelivery(rows) {
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  const placeholders = ids.map(() => "?").join(", ");

  const [readRows] = await pool.query(
    `SELECT message_id, user_id FROM message_reads WHERE message_id IN (${placeholders})`,
    ids
  );
  const [deliveryRows] = await pool.query(
    `SELECT message_id, user_id FROM message_deliveries WHERE message_id IN (${placeholders})`,
    ids
  );

  const readMap = new Map();
  readRows.forEach((r) => {
    if (!readMap.has(r.message_id)) readMap.set(r.message_id, []);
    readMap.get(r.message_id).push(String(r.user_id));
  });
  const deliveryMap = new Map();
  deliveryRows.forEach((r) => {
    if (!deliveryMap.has(r.message_id)) deliveryMap.set(r.message_id, []);
    deliveryMap.get(r.message_id).push(String(r.user_id));
  });

  return rows.map((row) => serializeMessage(row, readMap.get(row.id) || [], deliveryMap.get(row.id) || []));
}

export function serializeMessage(row, readBy = [], deliveredTo = []) {
  return {
    id: String(row.id),
    conversation: String(row.conversation_id),
    sender: {
      id: String(row.sender_id),
      username: row.sender_username,
      name: row.sender_name,
      avatarColor: row.sender_avatar_color
    },
    type: row.type,
    text: row.deleted_for_everyone ? "" : row.text || "",
    fileName: row.deleted_for_everyone ? "" : row.file_name || "",
    fileData: row.deleted_for_everyone ? "" : row.file_data || "",
    timestamp: new Date(row.timestamp).getTime(),
    deletedForEveryone: !!row.deleted_for_everyone,
    readBy,
    deliveredTo
  };
}

export const MESSAGE_SELECT_WITH_SENDER = `
  SELECT m.*, u.username AS sender_username, u.name AS sender_name, u.avatar_color AS sender_avatar_color
  FROM messages m
  JOIN users u ON u.id = m.sender_id
`;
