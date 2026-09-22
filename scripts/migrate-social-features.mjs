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

  console.log("✅ Migration complete.");
  await conn.end();
}

main().catch((err) => {
  console.error("Migration failed:", err.message);
  process.exit(1);
});
