import { useEffect } from "react";
import { io, type Socket } from "socket.io-client";
import toast from "react-hot-toast";
import { getToken } from "../lib/auth";
import type { ClientToServerEvents, ServerToClientEvents } from "../lib/realtime";
import { useDropsStore } from "../store/dropsStore";

const WS_URL = import.meta.env.VITE_WS_URL || window.location.origin;

export function useSocket(enabled: boolean, onReconnect?: () => void): void {
  const updateStock = useDropsStore((s) => s.updateStock);
  const addPurchaser = useDropsStore((s) => s.addPurchaser);
  const addDrop = useDropsStore((s) => s.addDrop);
  const removeReservation = useDropsStore((s) => s.removeReservation);

  useEffect(() => {
    if (!enabled) return;

    const token = getToken();
    const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(WS_URL, {
      auth: token ? { token } : {},
      withCredentials: true,
      transports: ["websocket"],
    });

    let initialConnect = true;
    let connectErrorShown = false;
    socket.on("connect_error", (err) => {
      if (connectErrorShown) return;
      connectErrorShown = true;
      const reason =
        err.message === "unauthorized"
          ? "Realtime connection unauthorized. Sign in again."
          : err.message === "rate limited"
            ? "Too many realtime connections. Wait a moment."
            : "Realtime connection failed.";
      toast.error(reason);
    });

    socket.on("connect", () => {
      if (initialConnect) {
        initialConnect = false;
        return;
      }
      onReconnect?.();
    });

    socket.on("stock:updated", (payload) => {
      updateStock(payload.dropId, payload.availableStock);
    });

    socket.on("drop:created", (payload) => {
      addDrop(payload);
    });

    socket.on("purchase:created", (payload) => {
      addPurchaser(payload.dropId, payload.username, payload.createdAt);
    });

    socket.on("reservation:expired", (payload) => {
      updateStock(payload.dropId, payload.availableStock);
      removeReservation(payload.reservationId);
    });

    return () => {
      socket.disconnect();
    };
  }, [enabled, onReconnect, updateStock, addPurchaser, addDrop, removeReservation]);
}
