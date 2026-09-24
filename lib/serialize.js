export function toPublicUser(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    username: row.username,
    name: row.name,
    bio: row.bio,
    avatarColor: row.avatar_color,
    avatarUrl: row.avatar_url || "",
    theme: row.theme || "classic",
    darkMode: !!row.dark_mode,
    status: row.status,
    isBot: !!row.is_bot,
    lastSeen: row.last_seen ? new Date(row.last_seen).getTime() : 0
  };
}

export function toLastMessage(row) {
  if (!row || !row.last_message_timestamp) {
    return { text: "", type: "text", sender: null, timestamp: 0 };
  }
  return {
    text: row.last_message_text || "",
    type: row.last_message_type || "text",
    sender: row.last_message_sender_id ? String(row.last_message_sender_id) : null,
    timestamp: new Date(row.last_message_timestamp).getTime()
  };
}
