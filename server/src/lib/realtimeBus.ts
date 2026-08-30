import type { Server } from "socket.io";
import type { ClientToServerEvents, ServerToClientEvents } from "../types/realtime";
import { getRedis, getRedisSubscriber } from "./redis";

const CHANNEL = "sneaker:rt";
const INVALIDATE = "sneaker:drops:invalidate";

type RealtimeEvent = keyof ServerToClientEvents;

type BridgeMessage = {
  event: RealtimeEvent;
  payload: unknown;
};

let invalidateHandler: (() => void) | null = null;

export function onDropCacheInvalidate(handler: () => void): void {
  invalidateHandler = handler;
}

export function publishDropCacheInvalidate(): void {
  const redis = getRedis();
  if (redis) void redis.publish(INVALIDATE, "1");
}

/** Returns true when Redis will deliver the event to every API process. */
export function publishRealtime(event: RealtimeEvent, payload: unknown): boolean {
  const redis = getRedis();
  if (!redis) return false;
  const message: BridgeMessage = { event, payload };
  void redis.publish(CHANNEL, JSON.stringify(message));
  return true;
}

export async function startRealtimeBridge(
  io: Server<ClientToServerEvents, ServerToClientEvents>
): Promise<void> {
  const sub = await getRedisSubscriber();
  if (!sub) return;

  await sub.subscribe(CHANNEL, INVALIDATE);
  sub.on("message", (channel: string, raw: string) => {
    if (channel === INVALIDATE) {
      invalidateHandler?.();
      return;
    }
    if (channel !== CHANNEL) return;
    try {
      const msg = JSON.parse(raw) as BridgeMessage;
      io.to("drops").emit(msg.event, msg.payload as never);
    } catch {
      /* ignore malformed bus messages */
    }
  });
}
