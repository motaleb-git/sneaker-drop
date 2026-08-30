/** In-process sliding window counter (single Node instance). */
export function createSlidingWindow(limit: number, windowMs: number) {
  const buckets = new Map<string, number[]>();

  return function allow(key: string): boolean {
    const now = Date.now();
    const recent = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
    if (recent.length >= limit) {
      buckets.set(key, recent);
      return false;
    }
    recent.push(now);
    buckets.set(key, recent);
    return true;
  };
}
