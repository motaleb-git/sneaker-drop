import { memo, useCallback, useState } from "react";
import toast from "react-hot-toast";
import { api, type Drop, type Reservation } from "../lib/api";
import { getHoldSeconds } from "../lib/config";
import { HttpError, notifyError } from "../lib/errors";
import { useCountdown } from "../hooks/useCountdown";
import { useHoldExpiry } from "../hooks/useHoldExpiry";
import { useDropsStore } from "../store/dropsStore";

type Props = {
  drop: Drop;
  reservation: Reservation | undefined;
};

function formatPrice(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

function dropState(drop: Drop): "upcoming" | "ended" | "live" {
  const now = Date.now();
  if (new Date(drop.startsAt).getTime() > now) return "upcoming";
  if (drop.endsAt && new Date(drop.endsAt).getTime() <= now) return "ended";
  return "live";
}

export const DropCard = memo(function DropCard({ drop, reservation }: Props) {
  const flashing = useDropsStore((s) => s.flashing[drop.id]);
  const addReservation = useDropsStore((s) => s.addReservation);
  const removeReservation = useDropsStore((s) => s.removeReservation);
  const updateStock = useDropsStore((s) => s.updateStock);
  const addPurchaser = useDropsStore((s) => s.addPurchaser);
  const [reserving, setReserving] = useState(false);
  const [purchasing, setPurchasing] = useState(false);

  const remaining = useCountdown(reservation?.expiresAt ?? null);
  const onHoldExpired = useCallback(
    (id: string) => removeReservation(id),
    [removeReservation]
  );
  useHoldExpiry(reservation?.id, remaining, onHoldExpired);

  const state = dropState(drop);
  const soldOut = drop.availableStock <= 0 && !reservation;

  async function onReserve(): Promise<void> {
    setReserving(true);
    try {
      const result = await api.reserve(drop.id);
      addReservation(result.reservation);
      updateStock(drop.id, result.availableStock);
      toast.success(`Reserved for ${getHoldSeconds()} seconds`);
    } catch (err) {
      notifyError(err, "Could not reserve this item.");
    } finally {
      setReserving(false);
    }
  }

  async function onPurchase(): Promise<void> {
    if (!reservation) return;
    setPurchasing(true);
    try {
      const result = await api.purchase(reservation.id);
      removeReservation(reservation.id);
      // Stock was decremented at reserve time; the purchase converts the hold
      // to a permanent sale so available stock doesn't change. Update the
      // purchaser list optimistically so the card reflects the new buyer.
      updateStock(drop.id, drop.availableStock);
      addPurchaser(drop.id, result.username, result.createdAt);
      toast.success("Purchase complete");
    } catch (err) {
      notifyError(err, "Could not complete the purchase.");
      if (err instanceof HttpError && err.code === "RESERVATION_EXPIRED") {
        removeReservation(reservation.id);
      }
    } finally {
      setPurchasing(false);
    }
  }

  return (
    <article className="flex flex-col rounded-xl border border-slate-800 bg-slate-900 p-5 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">{drop.name}</h2>
          <p className="mt-1 text-sm text-slate-400">{formatPrice(drop.priceCents)}</p>
        </div>
        <StatusBadge state={state} soldOut={soldOut} />
      </div>

      <div className="mb-4 rounded-lg bg-slate-950 px-4 py-3">
        <p className="text-xs uppercase tracking-wide text-slate-500">
          Available stock
        </p>
        <p
          key={flashing}
          className={`text-4xl font-bold tabular-nums ${
            soldOut ? "text-rose-400" : "text-amber-300"
          } ${flashing ? "stock-flash" : ""}`}
        >
          {drop.availableStock}
        </p>
        <p className="text-xs text-slate-500">of {drop.totalStock} total</p>
      </div>

      <div className="mb-4">
        <p className="mb-1 text-xs uppercase tracking-wide text-slate-500">
          Recent buyers
        </p>
        {drop.recentPurchasers.length === 0 ? (
          <p className="text-sm text-slate-500">No purchases yet</p>
        ) : (
          <ol className="space-y-1 text-sm">
            {drop.recentPurchasers.map((p, i) => (
              <li key={`${p.username}-${p.createdAt}-${i}`} className="text-slate-200">
                {p.username}
              </li>
            ))}
          </ol>
        )}
      </div>

      {reservation ? (
        <div className="mt-auto space-y-2">
          {remaining > 0 ? (
            <>
              <p className="text-sm text-amber-200">
                Your hold expires in <span className="font-semibold">{remaining}s</span>
              </p>
              <button
                type="button"
                onClick={() => void onPurchase()}
                disabled={purchasing}
                className="w-full rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-emerald-950 disabled:opacity-60"
              >
                {purchasing ? "Completing…" : "Complete Purchase"}
              </button>
            </>
          ) : (
            <p className="text-sm text-slate-400">Hold expired — restoring stock…</p>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => void onReserve()}
          disabled={reserving || state !== "live" || soldOut}
          className="mt-auto w-full rounded-lg bg-amber-400 px-4 py-2.5 text-sm font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {reserving
            ? "Reserving…"
            : state === "upcoming"
              ? `Opens ${new Date(drop.startsAt).toLocaleTimeString()}`
              : state === "ended"
                ? "Drop ended"
                : soldOut
                  ? "Sold out"
                  : "Reserve"}
        </button>
      )}
    </article>
  );
});

function StatusBadge({
  state,
  soldOut,
}: {
  state: "upcoming" | "ended" | "live";
  soldOut: boolean;
}) {
  if (state === "upcoming") {
    return (
      <span className="rounded-full bg-sky-500/15 px-2.5 py-1 text-xs font-medium text-sky-300">
        Upcoming
      </span>
    );
  }
  if (state === "ended" || soldOut) {
    return (
      <span className="rounded-full bg-rose-500/15 px-2.5 py-1 text-xs font-medium text-rose-300">
        {state === "ended" ? "Ended" : "Sold out"}
      </span>
    );
  }
  return (
    <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-300">
      Live
    </span>
  );
}
