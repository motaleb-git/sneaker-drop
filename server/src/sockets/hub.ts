import type { Server } from "socket.io";
import { publishRealtime } from "../lib/realtimeBus";
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

function fanout(event: keyof ServerToClientEvents, payload: unknown): void {
  if (publishRealtime(event, payload)) return;
  if (!io) return;
  (io.to("drops").emit as (e: keyof ServerToClientEvents, p: unknown) => void)(event, payload);
}

export function emitStockUpdated(dropId: string, availableStock: number): void {
  fanout("stock:updated", { dropId, availableStock });
}

export function emitDropCreated(payload: DropCreated): void {
  fanout("drop:created", payload);
}

export function emitPurchaseCreated(payload: PurchaseCreated): void {
  fanout("purchase:created", payload);
}

export function emitReservationExpired(payload: ReservationExpired): void {
  fanout("reservation:expired", payload);
}
