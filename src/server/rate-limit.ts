import "server-only";

/**
 * Fixed-window in-memory rate limiter. Good for a single Node instance / dev.
 * For multi-instance production deployments swap `store` for Redis (Upstash) —
 * the interface is intentionally tiny.
 */
interface Bucket {
  count: number;
  resetAt: number;
}

const store = new Map<string, Bucket>();

export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const bucket = store.get(key);
  if (!bucket || bucket.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1, resetAt: now + windowMs };
  }
  bucket.count += 1;
  if (store.size > 50_000) {
    for (const [k, b] of store) if (b.resetAt <= now) store.delete(k);
  }
  return { ok: bucket.count <= limit, remaining: Math.max(0, limit - bucket.count), resetAt: bucket.resetAt };
}

export function resetRateLimits() {
  store.clear();
}
