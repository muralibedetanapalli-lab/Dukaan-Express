import "server-only";
import { EventEmitter } from "node:events";

export interface RealtimeEvent {
  type: string; // "notification" | "order.updated" | ...
  payload: Record<string, unknown>;
}

const g = globalThis as unknown as { __dxBus?: EventEmitter };
const bus = (g.__dxBus ??= (() => {
  const e = new EventEmitter();
  e.setMaxListeners(10_000);
  return e;
})());

/**
 * In-process pub/sub. Delivers instantly to SSE connections on this instance; the SSE route also
 * polls the Notification table so clients connected to other instances still receive updates.
 * Swap for Redis pub/sub (or Pusher/Ably) when horizontally scaling.
 */
export function publish(userId: string, event: RealtimeEvent) {
  bus.emit(`user:${userId}`, event);
}

export function subscribe(userId: string, fn: (e: RealtimeEvent) => void) {
  bus.on(`user:${userId}`, fn);
  return () => bus.off(`user:${userId}`, fn);
}
