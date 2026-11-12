import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd());

type VercelConfig = { functions?: Record<string, { regions?: string[] }> };

describe("serverless function region", () => {
  const config = JSON.parse(readFileSync(resolve(root, "vercel.json"), "utf8")) as VercelConfig;

  it("runs the public search and health functions beside the Supabase database", () => {
    // The school's Supabase project is in Singapore (ap-southeast-1). Every search
    // makes several sequential queries, so the functions must share that region
    // (Vercel sin1) instead of the US default. Per-function overrides use the
    // plural `regions` array; a singular `region` key fails schema validation.
    expect(config.functions?.["api/search.ts"]?.regions).toEqual(["sin1"]);
    expect(config.functions?.["api/health.ts"]?.regions).toEqual(["sin1"]);
  });

  it("keeps region pinning limited to the read paths that need it", () => {
    const entries = Object.entries(config.functions ?? {});
    expect(entries.map(([path]) => path).sort()).toEqual(["api/health.ts", "api/search.ts"]);
    expect(entries.every(([, entry]) => entry.regions?.length === 1)).toBe(true);
    // Vercel's schema rejects a singular `region` key, which fails the whole build.
    expect(entries.every(([, entry]) => !("region" in entry))).toBe(true);
  });
});
