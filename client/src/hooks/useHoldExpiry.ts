import { useEffect, useRef } from "react";

/** Drop client-side hold when countdown finishes (skip refresh race). */
export function useHoldExpiry(
  reservationId: string | undefined,
  remaining: number,
  onExpired: (id: string) => void
): void {
  const wasActive = useRef(false);

  useEffect(() => {
    if (remaining > 0) wasActive.current = true;
    if (reservationId && wasActive.current && remaining <= 0) {
      onExpired(reservationId);
      wasActive.current = false;
    }
  }, [reservationId, remaining, onExpired]);
}
