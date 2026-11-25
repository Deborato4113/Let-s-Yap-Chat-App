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
    queueLimit: 0,
    // Over a real network (e.g. this dev machine talking to AWS RDS, as
    // opposed to a local MySQL on the same box), a connection that's sat
    // idle in the pool can go silently dead - a home/office router, VPN or
    // AWS's own idle-connection cleanup drops it without telling either
    // side. The next query to grab that "connection" then just hangs until
    // the OS eventually notices and resets it, which is exactly the 30-90+
    // second waits followed by ECONNRESET seen in the logs. These settings
    // fix that:
    enableKeepAlive: true, // TCP-level keepalive probes detect a dead socket
    keepAliveInitialDelay: 10000, // within ~10s instead of waiting on
    // whatever long OS/NAT timeout would otherwise apply.
    connectTimeout: 15000, // fail fast (15s) instead of hanging on a new
    // connection attempt that's never going to succeed.
    idleTimeout: 60000, // proactively close/replace a pooled connection
    maxIdle: 10 // after 60s idle, rather than waiting for it to go stale.
  });

  // A dead pooled connection surfaces as an 'error' event on the pool itself
  // (not as a rejection from the .query() call that happens to be using it).
  // mysql2/Node treats an EventEmitter 'error' with no listener as fatal -
  // that's the "unhandledRejection ... ECONNRESET ... fatal: true" that was
  // taking down request handling. Logging it here instead lets the pool
  // quietly drop the dead connection and open a fresh one on the next query.
  pool.on("error", (err) => {
    console.error("MySQL pool error (connection dropped, pool will reconnect):", err.code || err.message);
  });
}

// A new connection attempt that times out never reached the database, so it is
// safe to simply try again (up to 2 more times) - on a flaky link to RDS this
// turns most one-off ETIMEDOUT failures into a slightly slower success.
if (!pool._retryPatched) {
  const origQuery = pool.query.bind(pool);
  pool.query = async function (...args) {
    let lastErr;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await origQuery(...args);
      } catch (err) {
        lastErr = err;
        const connectFailed = err && (err.code === "ETIMEDOUT" || err.code === "ECONNREFUSED") && err.syscall === "connect";
        if (!connectFailed) throw err;
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
      }
    }
    throw lastErr;
  };
  pool._retryPatched = true;
}

export default pool;
