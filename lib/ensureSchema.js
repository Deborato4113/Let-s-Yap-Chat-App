import pool from "./db.js";

// Creates the extra columns/tables used by favourites, chat lists, reports,
// disappearing messages and AI moderation the first time they're needed, so
// no manual migration is required on either the local or the deployed
// database. Cached per process.
let ready = null;

async function addColumnIfMissing(table, column, ddl) {
  const [cols] = await pool.query(
    `SELECT 1 FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  if (cols.length > 0) return;
  try {
    await pool.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
  } catch (err) {
    if (err.code !== "ER_DUP_FIELDNAME") throw err;
  }
}

export function ensureSchema() {
  if (!ready) {
    ready = (async () => {
      await addColumnIfMissing("conversations", "disappearing_seconds", "INT NOT NULL DEFAULT 0");
      // Group admin controls
      await addColumnIfMissing("conversations", "only_admins_send", "TINYINT(1) NOT NULL DEFAULT 0");
      await addColumnIfMissing("conversations", "group_avatar_url", "MEDIUMTEXT NULL");
      await addColumnIfMissing("conversation_participants", "is_admin", "TINYINT(1) NOT NULL DEFAULT 0");
      // Every group must have an admin: groups that predate admins get their creator
      // (or, if that account is gone, their longest-standing member).
      await pool.query(`
        UPDATE conversation_participants cp
        JOIN conversations c ON c.id = cp.conversation_id AND c.is_group = 1 AND c.created_by = cp.user_id
        SET cp.is_admin = 1
        WHERE c.id NOT IN (SELECT t.conversation_id FROM (SELECT conversation_id FROM conversation_participants WHERE is_admin = 1) t)`);
      await pool.query(`
        UPDATE conversation_participants cp
        JOIN (SELECT p.conversation_id, MIN(p.user_id) AS uid FROM conversation_participants p
              JOIN conversations g ON g.id = p.conversation_id AND g.is_group = 1
              WHERE p.conversation_id NOT IN (SELECT t.conversation_id FROM (SELECT conversation_id FROM conversation_participants WHERE is_admin = 1) t)
              GROUP BY p.conversation_id) f
          ON f.conversation_id = cp.conversation_id AND f.uid = cp.user_id
        SET cp.is_admin = 1`);
      // Sign-in security: one row per logged-in device, plus two-step verification
      await pool.query(`
        CREATE TABLE IF NOT EXISTS sessions (
          id CHAR(36) PRIMARY KEY,
          user_id INT NOT NULL,
          device VARCHAR(255) NOT NULL DEFAULT '',
          ip VARCHAR(64) NOT NULL DEFAULT '',
          created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
          last_active DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
          revoked_at DATETIME(3) NULL,
          INDEX idx_sessions_user (user_id),
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
      await addColumnIfMissing("users", "tokens_valid_after", "DATETIME(3) NULL");
      await addColumnIfMissing("users", "totp_secret", "VARCHAR(64) NULL");
      await addColumnIfMissing("users", "totp_enabled", "TINYINT(1) NOT NULL DEFAULT 0");
      await addColumnIfMissing("users", "totp_backup", "TEXT NULL");
      await addColumnIfMissing("users", "totp_last_step", "BIGINT NOT NULL DEFAULT 0");
      // Web push: one row per browser/device that turned notifications on
      await pool.query(`
        CREATE TABLE IF NOT EXISTS push_subscriptions (
          id INT AUTO_INCREMENT PRIMARY KEY,
          user_id INT NOT NULL,
          endpoint VARCHAR(700) NOT NULL,
          p256dh VARCHAR(255) NOT NULL,
          auth VARCHAR(255) NOT NULL,
          created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
          UNIQUE KEY uq_push_endpoint (endpoint(255)),
          INDEX idx_push_user (user_id),
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
      await addColumnIfMissing("messages", "transcript", "MEDIUMTEXT NULL"); // voice note -> text, cached
      await addColumnIfMissing("messages", "view_once", "TINYINT(1) NOT NULL DEFAULT 0"); // photo/video that can be opened once
      await addColumnIfMissing("messages", "forward_count", "TINYINT UNSIGNED NOT NULL DEFAULT 0"); // 0 = original, 5+ = "forwarded many times"
      await pool.query(`
        CREATE TABLE IF NOT EXISTS view_once_views (
          message_id INT NOT NULL,
          user_id INT NOT NULL,
          viewed_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
          PRIMARY KEY (message_id, user_id),
          FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS drafts (
          user_id INT NOT NULL,
          conversation_id INT NOT NULL,
          text TEXT NOT NULL,
          updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
          PRIMARY KEY (user_id, conversation_id),
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS app_secrets (
          name VARCHAR(64) PRIMARY KEY,
          value TEXT NOT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
      await addColumnIfMissing("messages", "expires_at", "DATETIME(3) NULL");
      await addColumnIfMissing("conversation_settings", "favourite", "TINYINT(1) NOT NULL DEFAULT 0");
      // AI moderation: classifier score (0-1) and whether it crossed the flag threshold
      await addColumnIfMissing("messages", "toxicity_score", "FLOAT NULL");
      await addColumnIfMissing("messages", "flagged", "TINYINT(1) NOT NULL DEFAULT 0");
      // Editing sent messages: when it was last edited (NULL = never)
      await addColumnIfMissing("messages", "edited_at", "DATETIME(3) NULL");
      // Pinned chats: when I pinned this chat (NULL = not pinned), per user
      await addColumnIfMissing("conversation_settings", "pinned_at", "DATETIME(3) NULL");
      // Archived chats: hidden from the main list for me only
      await addColumnIfMissing("conversation_settings", "archived", "TINYINT(1) NOT NULL DEFAULT 0");
      // Default disappearing-messages timer applied to new chats I start (0 = off)
      await addColumnIfMissing("users", "default_disappearing_seconds", "INT NOT NULL DEFAULT 0");

      await pool.query(`
        CREATE TABLE IF NOT EXISTS chat_lists (
          id INT AUTO_INCREMENT PRIMARY KEY,
          user_id INT NOT NULL,
          name VARCHAR(40) NOT NULL,
          created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS chat_list_items (
          list_id INT NOT NULL,
          conversation_id INT NOT NULL,
          PRIMARY KEY (list_id, conversation_id),
          FOREIGN KEY (list_id) REFERENCES chat_lists(id) ON DELETE CASCADE,
          FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS reports (
          id INT AUTO_INCREMENT PRIMARY KEY,
          reporter_id INT NOT NULL,
          reported_user_id INT NULL,
          conversation_id INT NULL,
          reason VARCHAR(60) NOT NULL,
          details VARCHAR(500) NOT NULL DEFAULT '',
          created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
          FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
      // Reports can point at one specific message
      await addColumnIfMissing("reports", "message_id", "INT NULL");
      // Users' verdicts on flagged messages: the labelled data for evaluating
      // (and later retraining / re-thresholding) the toxicity classifier.
      await pool.query(`
        CREATE TABLE IF NOT EXISTS moderation_feedback (
          message_id INT NOT NULL,
          user_id INT NOT NULL,
          verdict ENUM('false_positive','correct') NOT NULL,
          score FLOAT NULL,
          created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
          PRIMARY KEY (message_id, user_id),
          FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
      // Group polls
      await pool.query(`
        CREATE TABLE IF NOT EXISTS polls (
          id INT AUTO_INCREMENT PRIMARY KEY,
          message_id INT NOT NULL UNIQUE,
          question VARCHAR(300) NOT NULL,
          multiple TINYINT(1) NOT NULL DEFAULT 0,
          FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS poll_options (
          id INT AUTO_INCREMENT PRIMARY KEY,
          poll_id INT NOT NULL,
          text VARCHAR(120) NOT NULL,
          position TINYINT NOT NULL DEFAULT 0,
          FOREIGN KEY (poll_id) REFERENCES polls(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS poll_votes (
          option_id INT NOT NULL,
          user_id INT NOT NULL,
          poll_id INT NOT NULL,
          created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
          PRIMARY KEY (option_id, user_id),
          INDEX idx_poll_user (poll_id, user_id),
          FOREIGN KEY (option_id) REFERENCES poll_options(id) ON DELETE CASCADE,
          FOREIGN KEY (poll_id) REFERENCES polls(id) ON DELETE CASCADE,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
      // "Send later" messages
      await pool.query(`
        CREATE TABLE IF NOT EXISTS scheduled_messages (
          id INT AUTO_INCREMENT PRIMARY KEY,
          conversation_id INT NOT NULL,
          sender_id INT NOT NULL,
          text TEXT NOT NULL,
          send_at DATETIME(3) NOT NULL,
          status VARCHAR(12) NOT NULL DEFAULT 'pending',
          created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
          INDEX idx_due (status, send_at),
          FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
          FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
      // Status / stories (24 hours)
      await pool.query(`
        CREATE TABLE IF NOT EXISTS statuses (
          id INT AUTO_INCREMENT PRIMARY KEY,
          user_id INT NOT NULL,
          kind VARCHAR(10) NOT NULL DEFAULT 'text',
          text VARCHAR(700) NOT NULL DEFAULT '',
          bg_color VARCHAR(9) NOT NULL DEFAULT '#00a884',
          file_data LONGTEXT NULL,
          created_at DATETIME(3) NOT NULL,
          expires_at DATETIME(3) NOT NULL,
          INDEX idx_user_created (user_id, created_at),
          INDEX idx_expires (expires_at),
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS status_views (
          status_id INT NOT NULL,
          viewer_id INT NOT NULL,
          viewed_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
          PRIMARY KEY (status_id, viewer_id),
          FOREIGN KEY (status_id) REFERENCES statuses(id) ON DELETE CASCADE,
          FOREIGN KEY (viewer_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    })().catch((err) => {
      ready = null;
      throw err;
    });
  }
  return ready;
}

// SQL fragment: hides disappearing messages whose time is up. `m` = messages alias.
// Compares against the app server's clock (formatted the same way mysql2 writes
// Dates), not the database's NOW(): they can differ by a timezone offset when
// the app runs on a laptop and the database is on AWS.
export function sqlLocal(date = new Date()) {
  const p = (n, l = 2) => String(n).padStart(l, "0");
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())} ${p(date.getHours())}:${p(date.getMinutes())}:${p(date.getSeconds())}.${p(date.getMilliseconds(), 3)}`;
}

export function notExpiredSql(alias = "m") {
  return `AND (${alias}.expires_at IS NULL OR ${alias}.expires_at > '${sqlLocal()}')`;
}
