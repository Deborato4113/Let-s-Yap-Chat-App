// Creates the target database itself (e.g. `lets_yap`) if it doesn't exist yet.
// Needed once, before `npm run db:setup`, since RDS gives you a MySQL SERVER,
// not a database — and DATABASE_URL already points at a specific database
// name that doesn't exist until this runs.
// Run with: node scripts/create-database.mjs
import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config();

async function main() {
  const uri = process.env.DATABASE_URL;
  if (!uri) {
    console.error("DATABASE_URL is not set. Add it to .env.local first.");
    process.exit(1);
  }

  const url = new URL(uri);
  const dbName = url.pathname.replace(/^\//, "");
  if (!dbName) {
    console.error("DATABASE_URL must include a database name at the end, e.g. .../lets_yap");
    process.exit(1);
  }

  const connection = await mysql.createConnection({
    host: url.hostname,
    port: url.port ? Number(url.port) : 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password)
    // no `database` here — it doesn't exist yet, that's the whole point
  });

  console.log(`Connected to ${url.hostname}. Creating database "${dbName}" if it doesn't exist...`);
  await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);
  console.log(`✅ Database "${dbName}" is ready.`);

  await connection.end();
}

main().catch((err) => {
  console.error("Failed to create database:", err.message);
  process.exit(1);
});
