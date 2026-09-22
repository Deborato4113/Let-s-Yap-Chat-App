// Creates all tables in sql/schema.sql against DATABASE_URL.
// Run with: npm run db:setup
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const uri = process.env.DATABASE_URL;
  if (!uri) {
    console.error("DATABASE_URL is not set. Add it to .env.local first.");
    process.exit(1);
  }

  const sql = fs.readFileSync(path.join(__dirname, "..", "sql", "schema.sql"), "utf8");
  const statements = sql
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);

  const connection = await mysql.createConnection(uri);
  console.log(`Connected to database. Running ${statements.length} statements...`);

  for (const statement of statements) {
    await connection.query(statement);
  }

  console.log("✅ Schema created successfully.");
  await connection.end();
}

main().catch((err) => {
  console.error("Failed to set up database:", err.message);
  process.exit(1);
});
