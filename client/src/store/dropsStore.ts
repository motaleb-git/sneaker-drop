import { create } from "zustand";
import type { Drop, Reservation } from "../lib/api";

type DropsState = {
  drops: Drop[];
  reservations: Reservation[];
  flashing: Record<string, number>;
  setDrops: (drops: Drop[]) => void;
  addDrop: (drop: Drop) => void;
  setReservations: (reservations: Reservation[]) => void;
  addReservation: (reservation: Reservation) => void;
  removeReservation: (reservationId: string) => void;
  updateStock: (dropId: string, availableStock: number) => void;
  addPurchaser: (dropId: string, username: string, createdAt: string) => void;
  reset: () => void;
};

export const useDropsStore = create<DropsState>((set) => ({
  drops: [],
  reservations: [],
  flashing: {},
  setDrops: (drops) => set({ drops }),
  addDrop: (drop) =>
    set((s) =>
      s.drops.some((d) => d.id === drop.id)
        ? s
        : { drops: [drop, ...s.drops] }
    ),
  setReservations: (reservations) => set({ reservations }),
  addReservation: (reservation) =>
    set((s) => ({
      reservations: [
        reservation,
        ...s.reservations.filter((r) => r.id !== reservation.id),
      ],
    })),
  removeReservation: (reservationId) =>
    set((s) => ({
      reservations: s.reservations.filter((r) => r.id !== reservationId),
    })),
  updateStock: (dropId, availableStock) =>
    set((s) => ({
      drops: s.drops.map((d) =>
        d.id === dropId ? { ...d, availableStock } : d
      ),
      flashing: { ...s.flashing, [dropId]: Date.now() },
    })),
  addPurchaser: (dropId, username, createdAt) =>
    set((s) => ({
      drops: s.drops.map((d) =>
        d.id === dropId
          ? {
              ...d,
              recentPurchasers: [
                { username, createdAt },
                ...d.recentPurchasers,
              ].slice(0, 3),
            }
          : d
      ),
    })),
  reset: () => set({ drops: [], reservations: [], flashing: {} }),
}));
