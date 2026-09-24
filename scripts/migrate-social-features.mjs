// Idempotent migration for an *existing* database created before profile
// pictures / themes / block / mute / clear-chat were added. Safe to re-run.
// Run with: node scripts/migrate-social-features.mjs
import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config();

async function columnExists(conn, table, column) {
  const [rows] = await conn.query(
    `SELECT 1 FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  return rows.length > 0;
}

async function tableExists(conn, table) {
  const [rows] = await conn.query(
    `SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [table]
  );
  return rows.length > 0;
}

async function main() {
  const uri = process.env.DATABASE_URL;
  if (!uri) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }
  const conn = await mysql.createConnection(uri);

  if (!(await columnExists(conn, "users", "avatar_url"))) {
    await conn.query("ALTER TABLE users ADD COLUMN avatar_url LONGTEXT NULL AFTER avatar_color");
    console.log("+ users.avatar_url");
  }
  if (!(await columnExists(conn, "users", "theme"))) {
    await conn.query("ALTER TABLE users ADD COLUMN theme VARCHAR(20) NOT NULL DEFAULT 'classic' AFTER avatar_url");
    console.log("+ users.theme");
  }
  if (!(await columnExists(conn, "users", "dark_mode"))) {
    await conn.query("ALTER TABLE users ADD COLUMN dark_mode TINYINT(1) NOT NULL DEFAULT 0 AFTER theme");
    console.log("+ users.dark_mode");
  }

  if (!(await tableExists(conn, "blocked_users"))) {
    await conn.query(`
      CREATE TABLE blocked_users (
        blocker_id INT NOT NULL,
        blocked_id INT NOT NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (blocker_id, blocked_id),
        FOREIGN KEY (blocker_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (blocked_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log("+ blocked_users table");
  }

  if (!(await tableExists(conn, "conversation_settings"))) {
    await conn.query(`
      CREATE TABLE conversation_settings (
        conversation_id INT NOT NULL,
        user_id INT NOT NULL,
        muted TINYINT(1) NOT NULL DEFAULT 0,
        cleared_before DATETIME(3) NULL,
        PRIMARY KEY (conversation_id, user_id),
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log("+ conversation_settings table");
  }

  if (!(await columnExists(conn, "users", "firebase_uid"))) {
    await conn.query("ALTER TABLE users ADD COLUMN firebase_uid VARCHAR(128) NULL UNIQUE AFTER password");
    console.log("+ users.firebase_uid");
  }
  // Firebase-only accounts (Google / Firebase email sign-in) never get a
  // local bcrypt password, so the column has to allow NULL.
  await conn.query("ALTER TABLE users MODIFY password VARCHAR(255) NULL");

  if (!(await columnExists(conn, "messages", "reply_to_id"))) {
    await conn.query("ALTER TABLE messages ADD COLUMN reply_to_id INT NULL AFTER deleted_for_everyone");
    await conn.query(
      "ALTER TABLE messages ADD CONSTRAINT fk_messages_reply_to FOREIGN KEY (reply_to_id) REFERENCES messages(id) ON DELETE SET NULL"
    );
    console.log("+ messages.reply_to_id");
  }
  if (!(await columnExists(conn, "messages", "pinned"))) {
    await conn.query("ALTER TABLE messages ADD COLUMN pinned TINYINT(1) NOT NULL DEFAULT 0 AFTER reply_to_id");
    console.log("+ messages.pinned");
  }

  if (!(await tableExists(conn, "message_reactions"))) {
    await conn.query(`
      CREATE TABLE message_reactions (
        message_id INT NOT NULL,
        user_id INT NOT NULL,
        emoji VARCHAR(16) NOT NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (message_id, user_id),
        FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log("+ message_reactions table");
  }

  if (!(await tableExists(conn, "message_stars"))) {
    await conn.query(`
      CREATE TABLE message_stars (
        message_id INT NOT NULL,
        user_id INT NOT NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (message_id, user_id),
        FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log("+ message_stars table");
  }

  if (!(await columnExists(conn, "users", "is_bot"))) {
    await conn.query("ALTER TABLE users ADD COLUMN is_bot TINYINT(1) NOT NULL DEFAULT 0 AFTER status");
    console.log("+ users.is_bot");
  }

  // Seed the "Yap AI" assistant user once - lib/yapAiBot.js also creates it
  // lazily on first use, but seeding it here means it shows up immediately
  // after a fresh migrate, with no server restart needed.
  const [botRows] = await conn.query("SELECT id FROM users WHERE username = 'yapai' LIMIT 1");
  if (botRows.length === 0) {
    await conn.query(
      `INSERT INTO users (username, email, password, name, bio, avatar_color, status, is_bot)
       VALUES ('yapai', 'yap-ai@system.local', NULL, 'Yap AI', 'Your built-in AI assistant. Ask me anything ✨', '#00A884', 'online', 1)`
    );
    console.log("+ Yap AI bot user");
  }

  console.log("✅ Migration complete.");
  await conn.end();
}

main().catch((err) => {
  console.error("Migration failed:", err.message);
  process.exit(1);
});
