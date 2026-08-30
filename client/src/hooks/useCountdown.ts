import { useEffect, useState } from "react";

export function useCountdown(expiresAt: string | null): number {
  const [remaining, setRemaining] = useState(() => secondsLeft(expiresAt));

  useEffect(() => {
    if (!expiresAt) {
      setRemaining(0);
      return;
    }

    const tick = (): void => setRemaining(secondsLeft(expiresAt));
    tick();

    const id = window.setInterval(tick, 1000);
    const onVisible = (): void => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [expiresAt]);

  return remaining;
}

function secondsLeft(expiresAt: string | null): number {
  if (!expiresAt) return 0;
  const diffMs = new Date(expiresAt).getTime() - Date.now();
  if (diffMs <= 0) return 0;
  // Floor + 1: 59.2s remaining displays as 60 (standard countdown UX).
  return Math.floor(diffMs / 1000) + 1;
}
