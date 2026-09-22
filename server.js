import "./lib/loadEnv.js"; // must run before lib/db.js reads process.env

import { createServer } from "http";
import next from "next";
import { Server } from "socket.io";
import pool from "./lib/db.js";
import { registerSocket } from "./lib/socketServer.js";

const dev = process.env.NODE_ENV !== "production";
const hostname = "localhost";
const port = Number(process.env.PORT) || 3000;

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(async () => {
  // Don't block the HTTP/socket server on the database being reachable — API
  // routes and socket handlers each query the pool themselves and will surface
  // a clear error if it isn't up yet, but pages should still load.
  pool
    .query("SELECT 1")
    .then(() => console.log("MySQL connected"))
    .catch((err) => console.error("MySQL connection error:", err.message));

  const httpServer = createServer((req, res) => handle(req, res));

  const io = new Server(httpServer, {
    path: "/api/socket",
    cors: { origin: `http://${hostname}:${port}` },
    // Base64-encoded attachments (up to the app's 5MB file cap, ~33% larger
    // once encoded) can exceed engine.io's 1MB default payload limit, which
    // silently drops the socket message instead of erroring — raise it to
    // give attachments headroom above the 5MB check in ChatWindow.js.
    maxHttpBufferSize: 10 * 1024 * 1024
  });

  registerSocket(io);

  httpServer.listen(port, () => {
    console.log(`Let's Yap running on http://${hostname}:${port}`);
  });
}).catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
