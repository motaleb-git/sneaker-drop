import { useEffect, useState } from "react";

export function useCountdown(expiresAt: string | null): number {
  const [remaining, setRemaining] = useState(() => secondsLeft(expiresAt));

  useEffect(() => {
    setRemaining(secondsLeft(expiresAt));
    if (!expiresAt) return;
    const id = window.setInterval(() => {
      setRemaining(secondsLeft(expiresAt));
    }, 250);
    return () => window.clearInterval(id);
  }, [expiresAt]);

  return remaining;
}

function secondsLeft(expiresAt: string | null): number {
  if (!expiresAt) return 0;
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 1000));
}
