import type { Server as HttpServer } from "http";
import { Server } from "socket.io";
import { env } from "../config/env";
import { createSlidingWindow } from "../lib/slidingWindow";
import { tokenFromCookieHeader } from "../lib/cookies";
import { verifyToken } from "../middleware/auth";
import type { ClientToServerEvents, ServerToClientEvents } from "../types/realtime";
import { setIo } from "./hub";

const allowSocketConnect = createSlidingWindow(40, 60_000);

export function attachSockets(httpServer: HttpServer): Server {
  const origins = env.CLIENT_ORIGIN.split(",").map((s) => s.trim());

  const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    cors: {
      origin: origins,
      credentials: true,
    },
    maxHttpBufferSize: 1e4,
    pingTimeout: 20_000,
    pingInterval: 25_000,
  });

  io.use((socket, next) => {
    const ip = socket.handshake.address || "unknown";
    if (!allowSocketConnect(ip)) {
      next(new Error("rate limited"));
      return;
    }
    const fromAuth = socket.handshake.auth?.token;
    const token =
      typeof fromAuth === "string" && fromAuth
        ? fromAuth
        : tokenFromCookieHeader(socket.handshake.headers.cookie);
    if (!token) {
      next(new Error("unauthorized"));
      return;
    }
    try {
      const payload = verifyToken(token);
      socket.data.userId = payload.sub;
      socket.data.username = payload.username;
      socket.data.role = payload.role;
      next();
    } catch {
      next(new Error("unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    void socket.join("drops");
    socket.on("disconnect", () => {
      socket.removeAllListeners();
    });
  });

  setIo(io);
  return io;
}
