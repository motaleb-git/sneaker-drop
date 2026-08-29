import type { Drop } from "./api";

export type StockUpdated = {
  dropId: string;
  availableStock: number;
};

export type PurchaseCreated = {
  dropId: string;
  username: string;
  createdAt: string;
};

export type ReservationExpired = {
  reservationId: string;
  dropId: string;
  availableStock: number;
};

export type ServerToClientEvents = {
  "stock:updated": (payload: StockUpdated) => void;
  "purchase:created": (payload: PurchaseCreated) => void;
  "reservation:expired": (payload: ReservationExpired) => void;
  "drop:created": (payload: Drop) => void;
};

export type ClientToServerEvents = Record<string, never>;
