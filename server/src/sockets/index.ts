import type { Server as HttpServer } from "http";
import { Server } from "socket.io";
import { env } from "../config/env";
import { tokenFromCookieHeader } from "../lib/cookies";
import { verifyToken } from "../middleware/auth";
import type { ClientToServerEvents, ServerToClientEvents } from "../types/realtime";
import { setIo } from "./hub";

const connectWindow = new Map<string, number[]>();

function allowConnect(ip: string): boolean {
  const now = Date.now();
  const recent = (connectWindow.get(ip) ?? []).filter((t) => now - t < 60_000);
  if (recent.length >= 40) {
    connectWindow.set(ip, recent);
    return false;
  }
  recent.push(now);
  connectWindow.set(ip, recent);
  return true;
}

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
    if (!allowConnect(ip)) {
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
