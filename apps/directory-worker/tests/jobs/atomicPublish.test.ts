import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { createInMemoryDirectoryStore } from "../../src/db/client.js";
import { createDatasetVersion, getActiveDatasetVersion, activateDatasetVersion } from "../../src/repositories/datasetVersions.js";
import { startAdminUpload } from "../../src/workflows/adminUpload.js";
import { InMemoryPrivateObjectStore } from "../../src/storage/privateObjectStore.js";
import { processImportJob } from "../../src/jobs/processImportJob.js";
import { publishDataset } from "../../src/jobs/publishDataset.js";
import { rollbackDataset } from "../../src/jobs/rollbackDataset.js";
import type { ImportSchemaConfig } from "../../src/import/schemaRules.js";

const config: ImportSchemaConfig = {
  schemaVersion: "student-v1",
  expectedAcademicYear: "2569",
  studentSheetPattern: /^M\d{1,2}-\d{1,2}$/,
  gradePattern: /^ม\.[1-6]$/,
  roomPattern: /^\d{1,2}$/
};
const fixture = new URL("../fixtures/xlsx/valid-room-per-sheet.xlsx", import.meta.url);

async function readyJob() {
  const store = createInMemoryDirectoryStore();
  const storage = new InMemoryPrivateObjectStore();
  const upload = await startAdminUpload(store, storage, {
    actor: { id: "importer-1", role: "importer" },
    filename: "valid-room-per-sheet.xlsx",
    bytes: await readFile(fixture),
    sourceType: "approved_student_xlsx",
    academicYear: "2569",
    origin: "manual-upload",
    parserVersion: "parser-1",
    mappingVersion: "mapping-1",
    jobId: "job-publish"
  });
  await processImportJob(store, storage, upload.job.id, { id: "importer-1", role: "importer" }, config);
  return { store, storage, jobId: upload.job.id };
}

describe("atomic publication and rollback", () => {
  it("keeps the old active version when indexing fails", async () => {
    const { store, storage, jobId } = await readyJob();
    const old = await createDatasetVersion(store, {
      id: "version-old",
      version: "2569.0",
      academicYear: "2569",
      parserVersion: "parser-1",
      mappingVersion: "mapping-1",
      sourceFileIds: [],
      studentCount: 1,
      staffCount: 0,
      warningCount: 0,
      createdBy: "owner-1"
    });
    await activateDatasetVersion(store, old.id, "owner-1");

    await expect(
      publishDataset({
        store,
        jobId,
        actor: { id: "publisher-1", role: "publisher" },
        version: "2569.1",
        indexRecords: async () => {
          throw new Error("synthetic index failure");
        }
      })
    ).rejects.toThrow("synthetic index failure");

    expect((await getActiveDatasetVersion(store))?.id).toBe("version-old");
    expect([...store.datasetVersions.values()].find((version) => version.version === "2569.1")?.status).toBe("publish_failed");
    expect(store.importJobs.get(jobId)?.status).toBe("publish_failed");
  });

  it("publishes a new version then rolls back to the retained prior version", async () => {
    const { store, storage, jobId } = await readyJob();
    const old = await createDatasetVersion(store, {
      id: "version-old",
      version: "2569.0",
      academicYear: "2569",
      parserVersion: "parser-1",
      mappingVersion: "mapping-1",
      sourceFileIds: [],
      studentCount: 1,
      staffCount: 0,
      warningCount: 0,
      createdBy: "owner-1"
    });
    await activateDatasetVersion(store, old.id, "owner-1");

    const published = await publishDataset({
      store,
      jobId,
      actor: { id: "publisher-1", role: "publisher" },
      version: "2569.1"
    });
    expect(published.status).toBe("active");
    expect(store.importJobs.get(jobId)?.status).toBe("published");

    const rolledBack = await rollbackDataset({
      store,
      versionId: old.id,
      actor: { id: "operator-1", role: "operator" }
    });
    expect(rolledBack.id).toBe(old.id);
    expect((await getActiveDatasetVersion(store))?.id).toBe(old.id);
    expect(store.auditEvents.map((event) => event.event)).toContain("rollback_succeeded");
  });
});
