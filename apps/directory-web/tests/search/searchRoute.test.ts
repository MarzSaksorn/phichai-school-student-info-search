import { describe, expect, it } from "vitest";
import { createInMemoryDirectoryStore } from "../../../directory-worker/src/db/client.js";
import { activateDatasetVersion, createDatasetVersion } from "../../../directory-worker/src/repositories/datasetVersions.js";
import { InMemorySearchIndex } from "../../../directory-worker/src/search/searchIndex.js";
import { createSearchRoute } from "../../src/app/api/search/route.js";
import { createDirectoryMetaRoute } from "../../src/app/api/directory/meta/route.js";

describe("public search routes", () => {
  it("returns safe errors for empty enumeration and no stack traces", async () => {
    const store = createInMemoryDirectoryStore();
    const index = new InMemorySearchIndex();
    const get = createSearchRoute({ store, index });
    const response = await get(new Request("https://directory.test/api/search?q="));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "EMPTY_QUERY_NOT_ALLOWED" });
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
