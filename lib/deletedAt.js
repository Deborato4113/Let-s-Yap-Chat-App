import pool from "./db.js";

// "Delete chat" is a per-user soft delete: the participant row stays (so the
// other person's chat isn't broken and a re-chat reuses the same conversation)
// and this timestamp hides it from the deleter's list until a new message
// arrives. The column is added automatically the first time it's needed, so
// no manual migration is required.
let deletedAtColumnReady = null;
export function ensureDeletedAtColumn() {
  if (!deletedAtColumnReady) {
    deletedAtColumnReady = (async () => {
      const [cols] = await pool.query(
        `SELECT 1 FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'conversation_settings' AND COLUMN_NAME = 'deleted_at'`
      );
      if (cols.length === 0) {
        try {
          await pool.query("ALTER TABLE conversation_settings ADD COLUMN deleted_at DATETIME(3) NULL");
        } catch (err) {
          if (err.code !== "ER_DUP_FIELDNAME") throw err;
        }
      }
    })().catch((err) => {
      deletedAtColumnReady = null;
      throw err;
    });
  }
  return deletedAtColumnReady;
}
