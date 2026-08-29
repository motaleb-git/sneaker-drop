let cached: { at: number; drops: unknown } | null = null;
let inflight: Promise<unknown> | null = null;

const TTL_MS = 400;

export function invalidateDropCache(): void {
  cached = null;
}

export async function cachedListDrops<T>(load: () => Promise<T[]>): Promise<T[]> {
  if (cached && Date.now() - cached.at < TTL_MS) {
    return cached.drops as T[];
  }
  if (inflight) return inflight as Promise<T[]>;

  inflight = load()
    .then((drops) => {
      cached = { at: Date.now(), drops };
      return drops;
    })
    .finally(() => {
      inflight = null;
    });

  return inflight as Promise<T[]>;
}
