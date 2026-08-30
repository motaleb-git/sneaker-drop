import { getRedis } from "../lib/redis";
import { onDropCacheInvalidate, publishDropCacheInvalidate } from "../lib/realtimeBus";

const KEY = "sneaker:drops:list";
const TTL_MS = 400;

let cached: { at: number; drops: unknown } | null = null;
let inflight: Promise<unknown> | null = null;
let subscribed = false;

function clearLocal(): void {
  cached = null;
}

export function invalidateDropCache(): void {
  clearLocal();
  const redis = getRedis();
  if (redis) {
    void redis.del(KEY);
    publishDropCacheInvalidate();
    return;
  }
}

async function readShared<T>(): Promise<T[] | null> {
  const redis = getRedis();
  if (!redis) return null;
  const raw = await redis.get(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T[];
  } catch {
    return null;
  }
}

async function writeShared(drops: unknown): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  await redis.set(KEY, JSON.stringify(drops), "PX", TTL_MS);
}

export async function cachedListDrops<T>(load: () => Promise<T[]>): Promise<T[]> {
  if (!subscribed) {
    subscribed = true;
    onDropCacheInvalidate(clearLocal);
  }

  if (cached && Date.now() - cached.at < TTL_MS) {
    return cached.drops as T[];
  }

  const shared = await readShared<T>();
  if (shared) {
    cached = { at: Date.now(), drops: shared };
    return shared;
  }

  if (inflight) return inflight as Promise<T[]>;

  inflight = load()
    .then(async (drops) => {
      cached = { at: Date.now(), drops };
      await writeShared(drops);
      return drops;
    })
    .finally(() => {
      inflight = null;
    });

  return inflight as Promise<T[]>;
}
