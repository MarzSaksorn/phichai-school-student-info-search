import { describe, expect, it } from "vitest";
import { createInMemoryDirectoryStore } from "../../../directory-worker/src/db/client.js";
import { activateDatasetVersion, createDatasetVersion } from "../../../directory-worker/src/repositories/datasetVersions.js";
import { InMemorySearchIndex } from "../../../directory-worker/src/search/searchIndex.js";
import { createSearchRoute } from "../../src/app/api/search/route.js";
import { InMemoryRateLimiter } from "../../src/server/rateLimit.js";
import type { NormalizedStudent } from "../../../directory-worker/src/import/normalizeStudent.js";

const record: NormalizedStudent = {
  publicId: "student-1", recordType: "student", academicYear: "2569", grade: "ม.1", room: "1",
  displayName: "เด็กชาย ก้อง", searchName: "เด็กชาย ก้อง", studentIdentifier: "001", sourceFileId: "secret",
  sourceFileName: "secret.xlsx", sourceSheet: "M1-1", sourceRow: 2
};

async function route(limit = 2) {
  const store = createInMemoryDirectoryStore();
  const index = new InMemorySearchIndex();
  const version = await createDatasetVersion(store, {
    id: "version-live", version: "2569.1", academicYear: "2569", parserVersion: "p1", mappingVersion: "m1",
    sourceFileIds: ["secret"], studentCount: 1, staffCount: 0, warningCount: 0, createdBy: "owner"
  });
  await index.replaceVersion(version.id, [record]);
  await activateDatasetVersion(store, version.id, "owner");
  const limiter = new InMemoryRateLimiter({ limit, windowMs: 60_000 });
  const get = createSearchRoute({ store, index }, { rateLimiter: limiter, clientKey: () => "test-client" });
  return { get, store };
}

describe("search security boundary", () => {
  it("returns 429 after the client budget is exhausted and writes no raw query to audit metadata", async () => {
    const { get, store } = await route(1);
    const first = await get(new Request("https://directory.test/api/search?q=ก้อง", { headers: { "x-forwarded-for": "192.0.2.10" } }));
    const second = await get(new Request("https://directory.test/api/search?q=001", { headers: { "x-forwarded-for": "192.0.2.10" } }));

    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
    expect(second.headers.get("retry-after")).toBe("60");
    expect(await second.json()).toEqual({ error: "RATE_LIMITED" });
    expect(store.auditEvents.map((event) => event.event)).toEqual(["search_requested", "search_rate_limited"]);
    const serialized = JSON.stringify(store.auditEvents.map((event) => event.safeMetadata));
    expect(serialized).not.toContain("ก้อง");
    expect(serialized).not.toContain("001");
    expect(serialized).not.toContain("192.0.2.10");
  });

  it("does not trust an unbounded forwarded-for list as a unique identity", async () => {
    const { get, store } = await route(2);
    const headers = { "x-forwarded-for": "1.1.1.1, 2.2.2.2, 3.3.3.3, 4.4.4.4" };
    await get(new Request("https://directory.test/api/search?q=ก้อง", { headers }));
    await get(new Request("https://directory.test/api/search?q=ก้อง", { headers }));
    const third = await get(new Request("https://directory.test/api/search?q=ก้อง", { headers }));
    expect(third.status).toBe(429);
    expect(store.auditEvents.filter((event) => event.event === "search_requested")).toHaveLength(2);
  });
});
