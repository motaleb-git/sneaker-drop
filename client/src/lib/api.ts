import { getToken } from "./auth";
import { HttpError, isAbortError } from "./errors";

export const API_URL = import.meta.env.VITE_API_URL ?? "";

export type { HttpError } from "./errors";

let unauthorizedHandler: (() => void) | null = null;

export function onUnauthorized(handler: () => void): void {
  unauthorizedHandler = handler;
}

type ErrorBody = {
  error?: string;
  code?: string;
  fields?: Record<string, string>;
};

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      headers,
      credentials: "include",
    });
  } catch (err) {
    if (isAbortError(err)) throw err;
    throw new TypeError("Failed to fetch");
  }

  const data = (await res.json().catch(() => ({}))) as ErrorBody & T;

  if (!res.ok) {
    const code = data.code || (res.status === 401 ? "UNAUTHORIZED" : "INTERNAL");
    if (res.status === 401 && !path.startsWith("/api/auth/")) {
      unauthorizedHandler?.();
    }
    throw new HttpError(
      res.status,
      code,
      data.error || "Request failed",
      data.fields
    );
  }
  return data as T;
}

export type RecentPurchaser = {
  username: string;
  createdAt: string;
};

export type Drop = {
  id: string;
  name: string;
  priceCents: number;
  totalStock: number;
  availableStock: number;
  startsAt: string;
  endsAt: string | null;
  createdAt: string;
  recentPurchasers: RecentPurchaser[];
};

export type Reservation = {
  id: string;
  dropId: string;
  userId: string;
  status: string;
  expiresAt: string;
  createdAt: string;
};

export const api = {
  register: (username: string, password: string) =>
    request<{ token: string; user: { id: string; username: string; role: "user" | "admin" } }>(
      "/api/auth/register",
      { method: "POST", body: JSON.stringify({ username, password }) }
    ),
  login: (username: string, password: string) =>
    request<{ token: string; user: { id: string; username: string; role: "user" | "admin" } }>(
      "/api/auth/login",
      { method: "POST", body: JSON.stringify({ username, password }) }
    ),
  logout: () => request<{ ok: boolean }>("/api/auth/logout", { method: "POST" }),
  listDrops: (signal?: AbortSignal) =>
    request<{ drops: Drop[]; reservationTtlSeconds?: number }>("/api/drops", {
      signal,
    }),
  createDrop: (body: {
    name: string;
    priceCents: number;
    totalStock: number;
    startsAt?: string;
    endsAt?: string;
  }) =>
    request<{ drop: Drop }>("/api/drops", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  reserve: (dropId: string) =>
    request<{ reservation: Reservation; availableStock: number }>(
      `/api/drops/${dropId}/reserve`,
      { method: "POST" }
    ),
  purchase: (reservationId: string) =>
    request<{ purchaseId: string; dropId: string; createdAt: string }>(
      `/api/reservations/${reservationId}/purchase`,
      { method: "POST" }
    ),
  myReservations: (signal?: AbortSignal) =>
    request<{ reservations: Reservation[] }>("/api/me/reservations", { signal }),
};
