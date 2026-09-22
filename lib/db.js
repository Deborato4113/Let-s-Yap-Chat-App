import mysql from "mysql2/promise";

// cache the pool across hot-reloads in dev / serverless invocations
let pool = global._mysqlPool;

if (!pool) {
  const uri = process.env.DATABASE_URL;
  if (!uri) {
    console.warn("DATABASE_URL is not set — set it in .env.local (see README).");
  }
  pool = global._mysqlPool = mysql.createPool({
    uri: uri || "mysql://root:@127.0.0.1:3306/lets_yap",
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  });
}

export default pool;
