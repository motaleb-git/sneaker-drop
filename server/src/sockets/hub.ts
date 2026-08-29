import type { Server } from "socket.io";
import type {
  ClientToServerEvents,
  DropCreated,
  PurchaseCreated,
  ReservationExpired,
  ServerToClientEvents,
} from "../types/realtime";

let io: Server<ClientToServerEvents, ServerToClientEvents> | null = null;

export function setIo(server: Server<ClientToServerEvents, ServerToClientEvents>): void {
  io = server;
}

export function getIo(): Server<ClientToServerEvents, ServerToClientEvents> {
  if (!io) {
    throw new Error("Socket.io has not been initialized");
  }
  return io;
}

export function emitStockUpdated(dropId: string, availableStock: number): void {
  if (!io) return;
  io.to("drops").emit("stock:updated", { dropId, availableStock });
}

export function emitDropCreated(payload: DropCreated): void {
  if (!io) return;
  io.to("drops").emit("drop:created", payload);
}

export function emitPurchaseCreated(payload: PurchaseCreated): void {
  if (!io) return;
  io.to("drops").emit("purchase:created", payload);
}

export function emitReservationExpired(payload: ReservationExpired): void {
  if (!io) return;
  io.to("drops").emit("reservation:expired", payload);
}
