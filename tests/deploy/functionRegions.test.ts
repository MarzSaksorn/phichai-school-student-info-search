import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd());

type VercelConfig = { functions?: Record<string, { region?: string }> };

describe("serverless function region", () => {
  const config = JSON.parse(readFileSync(resolve(root, "vercel.json"), "utf8")) as VercelConfig;

  it("runs the public search and health functions beside the Supabase database", () => {
    // The school's Supabase project is in Singapore (ap-southeast-1). Every search
    // makes several sequential queries, so the functions must share that region
    // instead of Vercel's US default.
    expect(config.functions?.["api/search.ts"]?.region).toBe("sin1");
    expect(config.functions?.["api/health.ts"]?.region).toBe("sin1");
  });

  it("keeps region pinning limited to the read paths that need it", () => {
    expect(Object.keys(config.functions ?? []).sort()).toEqual(["api/health.ts", "api/search.ts"]);
  });
});
