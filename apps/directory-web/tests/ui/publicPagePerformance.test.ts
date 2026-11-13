import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(import.meta.dirname, "../../src/main.tsx"), "utf8");

describe("public directory response cache and progressive loading", () => {
  it("keeps a bounded in-memory cache with short-lived dataset-aware entries", () => {
    expect(source).toContain("CACHE_TTL_MS = 60_000");
    expect(source).toContain("CACHE_LIMIT = 32");
    expect(source).toContain("activeDatasetVersion.current");
    expect(source).toContain("cache.current.clear()");
    expect(source).toContain("cache.current.delete(oldest)");
  });

  it("keeps cursor pagination, prefetch, and request cancellation", () => {
    expect(source).toContain('pageSize: PAGE_SIZE');
    expect(source).toContain('params.set("cursor", cursor)');
    expect(source).toContain("IntersectionObserver");
    expect(source).toContain("LOAD_AHEAD_PX = 600");
    expect(source).toContain("new AbortController()");
    expect(source).toContain("controller.current?.abort()");
  });

  it("does not persist search results in browser storage", () => {
    expect(source).not.toMatch(/localStorage\s*(?:\.|\[)|sessionStorage\s*(?:\.|\[)|indexedDB\s*\./u);
    expect(source).not.toContain("studentIdentifier");
    expect(source).toContain("item.studentNumber");
  });

  it("hides load more when there is no next cursor", () => {
    expect(source).toContain('className={`load-more ${nextCursor ? "is-visible" : ""}`}');
    expect(source).toContain("ดูรายชื่อเพิ่มเติม");
  });
});
