import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { CreateDropForm } from "../components/CreateDropForm";
import { DropCard } from "../components/DropCard";
import { useSocket } from "../hooks/useSocket";
import { api } from "../lib/api";
import { setHoldSeconds } from "../lib/config";
import { ownPendingHolds } from "../lib/reservations";
import { isAbortError, toUserMessage } from "../lib/errors";
import { clearSession, type AuthUser } from "../lib/auth";
import { useDropsStore } from "../store/dropsStore";

type Props = {
  user: AuthUser;
  onLogout: () => void;
};

export function Dashboard({ user, onLogout }: Props) {
  const drops = useDropsStore((s) => s.drops);
  const reservations = useDropsStore((s) => s.reservations);
  const setDrops = useDropsStore((s) => s.setDrops);
  const setReservations = useDropsStore((s) => s.setReservations);
  const resetStore = useDropsStore((s) => s.reset);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(
    async (signal?: AbortSignal, quiet = false): Promise<void> => {
      try {
        const [dropsRes, mine] = await Promise.all([
          api.listDrops(signal),
          api.myReservations(signal),
        ]);
        if (signal?.aborted) return;
        if (dropsRes.reservationTtlSeconds) {
          setHoldSeconds(dropsRes.reservationTtlSeconds);
        }
        setDrops(dropsRes.drops);
        setReservations(mine.reservations);
        setLoadError(null);
      } catch (err) {
        if (isAbortError(err) || signal?.aborted) return;
        const message = toUserMessage(err, "Could not load drops.");
        setLoadError(message);
        if (!quiet) toast.error(message);
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [setDrops, setReservations]
  );

  const onReconnect = useCallback(() => {
    void load(undefined, true);
  }, [load]);

  useSocket(true, onReconnect);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const reservationByDrop = useMemo(() => {
    const map = new Map<string, (typeof reservations)[number]>();
    for (const reservation of ownPendingHolds(reservations, user.id)) {
      map.set(reservation.dropId, reservation);
    }
    return map;
  }, [reservations, user.id]);

  async function logout(): Promise<void> {
    try {
      await api.logout();
    } catch {
      /* cookie clear is best-effort */
    }
    resetStore();
    clearSession();
    onLogout();
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-300">
            Live inventory
          </p>
          <h1 className="text-3xl font-bold text-white">Merch Drop</h1>
          <p className="mt-1 text-sm text-slate-400">
            Signed in as <span className="text-slate-200">{user.username}</span>
            {user.role === "admin" ? " · admin" : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void logout()}
          className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-200"
        >
          Sign out
        </button>
      </header>

      {user.role === "admin" ? <CreateDropForm /> : null}

      {loading ? (
        <p className="mt-8 text-sm text-slate-400">Loading drops…</p>
      ) : loadError ? (
        <div className="mt-8 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4">
          <p className="text-sm text-rose-200">{loadError}</p>
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              void load();
            }}
            className="mt-3 rounded-lg bg-amber-400 px-3 py-1.5 text-sm font-semibold text-slate-950"
          >
            Retry
          </button>
        </div>
      ) : drops.length === 0 ? (
        <p className="mt-8 text-sm text-slate-400">
          No drops yet.{user.role === "admin" ? " Create one above or run the seed script." : " Ask an admin to publish a drop, or run the seed script."}
        </p>
      ) : (
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {drops.map((drop) => (
            <DropCard
              key={drop.id}
              drop={drop}
              reservation={reservationByDrop.get(drop.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
