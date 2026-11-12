import { describe, expect, it } from "vitest";
import { createDirectoryE2EHarness } from "../../src/server/e2eHarness.js";

describe("directory end-to-end lifecycle", () => {
  it("publishes a synthetic XLSX-derived dataset and serves Thai search results with safe pagination", async () => {
    const harness = await createDirectoryE2EHarness({ rateLimit: 10 });
    const published = await harness.publish({ version: "2569.1" });
    expect(published.status).toBe("active");

    const first = await harness.search("ก้อง", { pageSize: 1 });
    expect(first.status).toBe(200);
    const firstBody = await first.json();
    expect(firstBody.items).toHaveLength(1);
    expect(firstBody.nextCursor).toBeDefined();
    expect(firstBody.items[0].studentNumber).toBeTruthy();
    expect(firstBody.items[0]).not.toHaveProperty("studentIdentifier");
    expect(firstBody.items[0]).not.toHaveProperty("sourceFileName");

    const second = await harness.search("ก้อง", { pageSize: 1, cursor: firstBody.nextCursor });
    const secondBody = await second.json();
    expect(second.status).toBe(200);
    expect(secondBody.items).toHaveLength(1);
    expect(secondBody.items[0].publicId).not.toBe(firstBody.items[0].publicId);
  });

  it("enforces the integrated rate limit and records only privacy-safe audit metadata", async () => {
    const harness = await createDirectoryE2EHarness({ rateLimit: 1 });
    await harness.publish({ version: "2569.1" });
    expect((await harness.search("ก้อง")).status).toBe(200);
    const limited = await harness.search("001");
    expect(limited.status).toBe(429);
    expect(await limited.json()).toEqual({ error: "RATE_LIMITED" });
    const audit = JSON.stringify(harness.store.auditEvents);
    const safeMetadata = JSON.stringify(harness.store.auditEvents.map((event) => event.safeMetadata));
    expect(audit).not.toContain("ก้อง");
    expect(safeMetadata).not.toContain("001");
    expect(audit).not.toContain("secret");
  });

  it("keeps the previous active version when the next index operation fails", async () => {
    const harness = await createDirectoryE2EHarness({ rateLimit: 10 });
    await harness.publish({ version: "2569.1" });
    await expect(harness.publish({ version: "2569.2", failIndexing: true })).rejects.toThrow("index failed");
    const response = await harness.search("Alice");
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.datasetVersion).toBe("2569.1");
  });
});
