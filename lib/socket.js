import { io } from "socket.io-client";

let socket = null;
let socketToken = null;

export function getSocket(token) {
  // Reuse the existing socket as long as it's for the same token, even while
  // it's still mid-handshake (not yet `connected`). Disconnecting a socket
  // that hasn't finished connecting yet is what causes the
  // "WebSocket is closed before the connection is established" warning -
  // React Strict Mode runs this effect twice in dev (mount -> cleanup ->
  // mount again), and the old code tore down the first, still-connecting
  // socket every time. Only create a new one when there's none yet or the
  // token actually changed (e.g. a different user logged in).
  if (socket && socketToken === token) return socket;
  if (socket) socket.disconnect();

  socketToken = token;
  // same-origin now that frontend and backend are one Next.js app
  socket = io({
    path: "/api/socket",
    auth: { token },
    transports: ["websocket", "polling"]
  });

  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  socketToken = null;
}
