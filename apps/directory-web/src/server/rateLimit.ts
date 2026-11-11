export type RateLimitDecision = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds?: number;
  resetAt: number;
};

export type RateLimiterOptions = {
  limit: number;
  windowMs: number;
  maxKeys?: number;
  now?: () => number;
};

type Bucket = { count: number; resetAt: number };

export class InMemoryRateLimiter {
  private readonly buckets = new Map<string, Bucket>();
  private readonly limit: number;
  private readonly windowMs: number;
  private readonly maxKeys: number;
  private readonly now: () => number;

  constructor(options: RateLimiterOptions) {
    if (!Number.isInteger(options.limit) || options.limit < 1) throw new Error("Rate-limit limit must be a positive integer");
    if (!Number.isFinite(options.windowMs) || options.windowMs < 1) throw new Error("Rate-limit window must be positive");
    this.limit = options.limit;
    this.windowMs = options.windowMs;
    this.maxKeys = options.maxKeys ?? 10_000;
    this.now = options.now ?? Date.now;
  }

  check(clientKey: string): RateLimitDecision {
    if (!clientKey.trim()) throw new Error("Rate-limit client key is required");
    const timestamp = this.now();
    const existing = this.buckets.get(clientKey);
    if (!existing && this.buckets.size >= this.maxKeys) {
      throw new Error("Rate-limit key capacity exhausted");
    }
    const bucket = existing && existing.resetAt > timestamp
      ? existing
      : { count: 0, resetAt: timestamp + this.windowMs };
    bucket.count += 1;
    this.buckets.set(clientKey, bucket);
    const allowed = bucket.count <= this.limit;
    const remaining = allowed ? this.limit - bucket.count : 0;
    if (!allowed) {
      return {
        allowed: false,
        remaining,
        resetAt: bucket.resetAt,
        retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - timestamp) / 1000))
      };
    }
    return { allowed: true, remaining, resetAt: bucket.resetAt };
  }
}

export function defaultClientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",", 1)[0]?.trim();
  const realIp = request.headers.get("x-real-ip")?.trim();
  const key = forwarded || realIp;
  if (key && key.length <= 128) return key;
  return "anonymous-client";
}
