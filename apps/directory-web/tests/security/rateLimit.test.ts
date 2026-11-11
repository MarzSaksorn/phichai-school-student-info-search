import { describe, expect, it } from "vitest";
import { InMemoryRateLimiter } from "../../src/server/rateLimit.js";

describe("search rate limiter", () => {
  it("limits requests per client within a fixed window and exposes safe retry metadata", () => {
    let now = 1_000;
    const limiter = new InMemoryRateLimiter({ limit: 2, windowMs: 10_000, now: () => now });

    expect(limiter.check("client-a")).toMatchObject({ allowed: true, remaining: 1 });
    expect(limiter.check("client-a")).toMatchObject({ allowed: true, remaining: 0 });
    expect(limiter.check("client-a")).toMatchObject({ allowed: false, remaining: 0, retryAfterSeconds: 10 });
    expect(limiter.check("client-b").allowed).toBe(true);

    now += 5_001;
    expect(limiter.check("client-a")).toMatchObject({ allowed: false, retryAfterSeconds: 5 });
    now += 5_000;
    expect(limiter.check("client-a")).toMatchObject({ allowed: true, remaining: 1 });
  });

  it("bounds client-key memory and rejects empty keys instead of sharing a global bucket", () => {
    const limiter = new InMemoryRateLimiter({ limit: 1, windowMs: 10_000, maxKeys: 2 });
    expect(() => limiter.check("")).toThrow(/client key/i);
    limiter.check("a");
    limiter.check("b");
    expect(() => limiter.check("c")).toThrow(/capacity/i);
  });
});
