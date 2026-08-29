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

export type DropCreated = {
  id: string;
  name: string;
  priceCents: number;
  totalStock: number;
  availableStock: number;
  startsAt: string;
  endsAt: string | null;
  createdAt: string;
  recentPurchasers: Array<{ username: string; createdAt: string }>;
};

export type ServerToClientEvents = {
  "stock:updated": (payload: StockUpdated) => void;
  "purchase:created": (payload: PurchaseCreated) => void;
  "reservation:expired": (payload: ReservationExpired) => void;
  "drop:created": (payload: DropCreated) => void;
};

export type ClientToServerEvents = Record<string, never>;
