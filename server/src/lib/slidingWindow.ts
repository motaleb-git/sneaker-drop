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
    // Evict the key entirely when the bucket is empty to prevent memory leak
    // on long-lived servers with high IP churn
    if (recent.length === 0) {
      buckets.delete(key);
    } else {
      buckets.set(key, recent);
    }
    return true;
  };
}
