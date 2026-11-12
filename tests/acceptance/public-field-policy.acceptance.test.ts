import { describe, expect, it } from "vitest";
import { createDirectoryE2EHarness } from "../../apps/directory-web/src/server/e2eHarness.js";

describe("acceptance: public privacy and publication safety", () => {
  it("exposes the approved student number while omitting internal identifier and source fields", async () => {
    const harness = await createDirectoryE2EHarness({ rateLimit: 20 });
    await harness.publish({ version: "2569.1" });
    const result = await harness.search("ก้อง", { pageSize: 10 });
    const body = await result.json();
    expect(result.status).toBe(200);
    expect(body.items).toHaveLength(2);
    for (const item of body.items) {
      expect(item.studentNumber).toBeTruthy();
      expect(item).not.toHaveProperty("studentIdentifier");
      expect(item).not.toHaveProperty("searchName");
      expect(item).not.toHaveProperty("sourceFileId");
      expect(item).not.toHaveProperty("sourceFileName");
      expect(item).not.toHaveProperty("sourceSheet");
      expect(item).not.toHaveProperty("sourceRow");
    }
    // An empty query is a browse request: the roster lists published students only.
    const roster = await harness.search("");
    expect(roster.status).toBe(200);
    const rosterBody = await roster.json();
    expect(rosterBody.items.length).toBeGreaterThan(0);
    for (const item of rosterBody.items) {
      expect(item.displayName.length).toBeGreaterThan(0);
      expect(item.studentNumber).toBeTruthy();
      expect(item).not.toHaveProperty("studentIdentifier");
      expect(item).not.toHaveProperty("searchName");
      expect(item).not.toHaveProperty("sourceFileId");
    }
    const byNumber = await harness.search("001");
    expect(byNumber.status).toBe(200);
    expect((await byNumber.json()).items).toMatchObject([{ studentNumber: "001" }]);
    const partialNumber = await harness.search("00");
    expect((await partialNumber.json()).items).toHaveLength(0);
  });

  it("preserves the old live version when indexing fails and restores it through rollback", async () => {
    const harness = await createDirectoryE2EHarness({ rateLimit: 20 });
    const first = await harness.publish({ version: "2569.1" });
    const second = await harness.publish({ version: "2569.2" });
    expect(second.version).toBe("2569.2");
    const activeBeforeRollback = (await harness.search("Alice")).json();
    expect((await activeBeforeRollback).datasetVersion).toBe("2569.2");

    const { rollbackDataset } = await import("../../apps/directory-worker/src/jobs/rollbackDataset.js");
    const restored = await rollbackDataset({ store: harness.store, versionId: first.id, actor: { id: "fixture-operator", role: "operator" } });
    expect(restored.version).toBe("2569.1");
    const after = await harness.search("Alice");
    expect((await after.json()).datasetVersion).toBe("2569.1");
  });
});
