import { io } from "socket.io-client";

let socket = null;

export function getSocket(token) {
  if (socket && socket.connected) return socket;
  if (socket) socket.disconnect();

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
}
