import { Redis } from "ioredis";
import { env } from "../config/env";

let client: Redis | null = null;
let subscriber: Redis | null = null;

export function getRedis(): Redis | null {
  return client;
}

export async function connectRedis(): Promise<void> {
  if (!env.REDIS_URL || client) return;

  // lazyConnect: true means we control when the connection is established
  const redis = new Redis(env.REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
  });

  try {
    await redis.connect();
    await redis.ping();
    client = redis;
    console.log("Redis connected (events + cache only — stock stays in Postgres)");
  } catch (err) {
    console.error("Redis unavailable — using in-process sockets and cache", err);
    redis.disconnect();
    client = null;
  }
}

export async function getRedisSubscriber(): Promise<Redis | null> {
  if (!client) return null;
  if (subscriber) return subscriber;

  // duplicate() creates a new connection with the same config.
  // With lazyConnect on the duplicate we explicitly connect before returning.
  subscriber = client.duplicate({ lazyConnect: true });
  try {
    await subscriber.connect();
  } catch (err) {
    console.error("Redis subscriber connect failed", err);
    subscriber.disconnect();
    subscriber = null;
    return null;
  }
  return subscriber;
}

export async function closeRedis(): Promise<void> {
  const closing = [subscriber, client];
  subscriber = null;
  client = null;
  await Promise.all(
    closing.map((c) =>
      c
        ? c.quit().catch(() => {
            c.disconnect();
          })
        : Promise.resolve()
    )
  );
}
