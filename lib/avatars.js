// Profile / group photos are stored in the database as base64 data URLs (up to
// several MB each). Sending those inside every chat list, member list and
// authenticated request used to pull megabytes per user into server memory
// (the cause of "Ran out of memory (used over 512MB)" on small hosts).
// Instead the database only reports whether a photo exists and a checksum, and
// the photo itself is served (and browser-cached) from /api/avatar/<kind>/<id>.

// every users column EXCEPT avatar_url, plus a length and checksum of it
export const USER_COLS =
  "id, username, email, password, firebase_uid, name, bio, avatar_color, theme, dark_mode, status, is_bot, last_seen, " +
  "created_at, updated_at, default_disappearing_seconds, tokens_valid_after, totp_secret, totp_enabled, totp_backup, totp_last_step, " +
  "LENGTH(avatar_url) AS avatar_len, CRC32(avatar_url) AS avatar_crc";

export function userCols(alias) {
  return USER_COLS.split(", ")
    .map((c) => (c.includes("(") ? c.replace("(avatar_url)", `(${alias}.avatar_url)`) : `${alias}.${c}`))
    .join(", ");
}

// every conversations column EXCEPT group_avatar_url
export const CONVO_COLS =
  "id, is_group, group_name, group_avatar_color, created_by, last_message_text, last_message_type, last_message_sender_id, " +
  "last_message_timestamp, created_at, updated_at, disappearing_seconds, only_admins_send, " +
  "LENGTH(group_avatar_url) AS group_avatar_len, CRC32(group_avatar_url) AS group_avatar_crc";

export function convoCols(alias) {
  return CONVO_COLS.split(", ")
    .map((c) => (c.includes("(") ? c.replace("(group_avatar_url)", `(${alias}.group_avatar_url)`) : `${alias}.${c}`))
    .join(", ");
}

// "/api/avatar/u/12?v=345" - the ?v= checksum changes when the photo changes, so browsers can cache it forever
export function avatarSrc(kind, id, len, crc) {
  return Number(len) > 0 ? `/api/avatar/${kind}/${id}?v=${crc >>> 0}` : "";
}

export function userAvatarFromRow(row) {
  if (!row) return "";
  if (row.avatar_len !== undefined) return avatarSrc("u", row.id, row.avatar_len, row.avatar_crc);
  return row.avatar_url ? avatarSrc("u", row.id, row.avatar_url.length, row.avatar_url.length) : "";
}
