type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();
const LIMIT = 60;
const WINDOW_MS = 60_000;
const MAX_KEYS = 10_000;

export function allowSearch(clientKey: string): { allowed: boolean; retryAfter: number } {
  const now = Date.now();
  if (buckets.size > MAX_KEYS) {
    for (const [key, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(key);
  }
  const current = buckets.get(clientKey);
  if (!current || current.resetAt <= now) {
    buckets.set(clientKey, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, retryAfter: 0 };
  }
  if (current.count >= LIMIT) return { allowed: false, retryAfter: Math.max(1, Math.ceil((current.resetAt - now) / 1000)) };
  current.count += 1;
  return { allowed: true, retryAfter: 0 };
}
