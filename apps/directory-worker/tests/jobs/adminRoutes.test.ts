import { describe, expect, it } from "vitest";
import { createInMemoryDirectoryStore } from "../../src/db/client.js";
import { createImportJob } from "../../src/repositories/importJobs.js";
import { getAdminImportStatus, requestRollback, requestPublish } from "../../src/routes/adminImports.js";

describe("admin job route contracts", () => {
  it("returns safe job status and stable unauthorized errors", async () => {
    const store = createInMemoryDirectoryStore();
    await createImportJob(store, {
      id: "job-1",
      sourceType: "approved_student_xlsx",
      academicYear: "2569",
      parserVersion: "parser-1",
      mappingVersion: "mapping-1",
      uploaderId: "importer-1",
      sourceFileIds: []
    });

    await expect(getAdminImportStatus(store, { id: "visitor", role: "public" }, "job-1")).resolves.toEqual({
      ok: false,
      code: "ADMIN_ROLE_REQUIRED"
    });
    await expect(getAdminImportStatus(store, { id: "operator-1", role: "operator" }, "job-1")).resolves.toMatchObject({
      ok: true,
      job: { id: "job-1", status: "uploaded" }
    });
  });

  it("does not allow an importer to publish or a publisher to rollback", async () => {
    const store = createInMemoryDirectoryStore();
    await expect(requestPublish(store, { id: "importer-1", role: "importer" }, "job-1", "2569.1")).resolves.toEqual({
      ok: false,
      code: "INSUFFICIENT_ADMIN_ROLE"
    });
    await expect(requestRollback(store, { id: "publisher-1", role: "publisher" }, "version-1")).resolves.toEqual({
      ok: false,
      code: "INSUFFICIENT_ADMIN_ROLE"
    });
  });
});
