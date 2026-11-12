import { describe, expect, it } from "vitest";
import { createInMemoryDirectoryStore } from "../../../directory-worker/src/db/client.js";
import { activateDatasetVersion, createDatasetVersion } from "../../../directory-worker/src/repositories/datasetVersions.js";
import { InMemorySearchIndex } from "../../../directory-worker/src/search/searchIndex.js";
import { createSearchRoute } from "../../src/app/api/search/route.js";
import { createDirectoryMetaRoute } from "../../src/app/api/directory/meta/route.js";

describe("public search routes", () => {
  it("returns a safe error and no stack traces when no dataset is active", async () => {
    const store = createInMemoryDirectoryStore();
    const index = new InMemorySearchIndex();
    const get = createSearchRoute({ store, index });
    const response = await get(new Request("https://directory.test/api/search?q="));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "NO_ACTIVE_DATASET" });
  });

  it("lists published students for an empty query instead of rejecting it", async () => {
    const store = createInMemoryDirectoryStore();
    const index = new InMemorySearchIndex();
    const version = await createDatasetVersion(store, {
      id: "version-roster",
      version: "2569.2",
      academicYear: "2569",
      parserVersion: "parser-1",
      mappingVersion: "mapping-1",
      sourceFileIds: ["private"],
      studentCount: 2,
      staffCount: 0,
      warningCount: 0,
      createdBy: "owner-1"
    });
    await index.replaceVersion(version.id, [
      { publicId: "student-a", recordType: "student", academicYear: "2569", grade: "ม.1", room: "1", displayName: "เด็กชาย ก้อง", searchName: "เด็กชาย ก้อง", sourceFileId: "private", sourceFileName: "private.xlsx", sourceSheet: "1", sourceRow: 6 },
      { publicId: "student-b", recordType: "student", academicYear: "2569", grade: "ม.2", room: "3", displayName: "Alice Smith", searchName: "alice smith", sourceFileId: "private", sourceFileName: "private.xlsx", sourceSheet: "2", sourceRow: 6 }
    ]);
    await activateDatasetVersion(store, version.id, "owner-1");
    const get = createSearchRoute({ store, index });
    const response = await get(new Request("https://directory.test/api/search?q=&pageSize=10"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.items).toHaveLength(2);
    expect(body.items.map((item: { displayName: string }) => item.displayName)).toContain("Alice Smith");
    expect(JSON.stringify(body)).not.toContain("private.xlsx");
  });

  it("returns active dataset metadata without private source details", async () => {
    const store = createInMemoryDirectoryStore();
    const version = await createDatasetVersion(store, {
      id: "version-live",
      version: "2569.1",
      academicYear: "2569",
      parserVersion: "parser-1",
      mappingVersion: "mapping-1",
      sourceFileIds: ["private"],
      studentCount: 1,
      staffCount: 0,
      warningCount: 0,
      createdBy: "owner-1"
    });
    await activateDatasetVersion(store, version.id, "owner-1");
    const getMeta = createDirectoryMetaRoute(store);
    const response = await getMeta();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ datasetVersion: "2569.1", academicYear: "2569" });
    expect(body).not.toHaveProperty("sourceFileIds");
  });
});
