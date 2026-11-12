import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd());
const read = (file: string) => readFileSync(resolve(root, file), "utf8");

describe("production monitoring contracts", () => {
  it("ships public health and protected operations endpoints", () => {
    expect(existsSync(resolve(root, "api/health.ts"))).toBe(true);
    expect(existsSync(resolve(root, "api/admin/operations.ts"))).toBe(true);
  });

  it("keeps telemetry privacy-safe and failure tolerant", () => {
    const telemetry = read("api/_lib/telemetry.ts");
    expect(telemetry).toContain("never");
    expect(telemetry).toContain("durationMs");
    expect(telemetry).not.toContain("queryText");
    expect(telemetry).not.toContain("displayName");
    expect(telemetry).not.toContain("accessToken");
  });

  it("keeps the public health response generic", () => {
    const health = read("api/health.ts");
    expect(health).toContain("status");
    expect(health).toContain("freshness");
    expect(health).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(health).not.toContain("stack");
  });
});
