import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { createInMemoryDirectoryStore } from "../../src/db/client.js";
import { startAdminUpload } from "../../src/workflows/adminUpload.js";
import { InMemoryPrivateObjectStore } from "../../src/storage/privateObjectStore.js";
import { processImportJob } from "../../src/jobs/processImportJob.js";
import type { ImportSchemaConfig } from "../../src/import/schemaRules.js";

const config: ImportSchemaConfig = {
  schemaVersion: "student-v1",
  expectedAcademicYear: "2569",
  studentSheetPattern: /^M\d{1,2}-\d{1,2}$/,
  gradePattern: /^ม\.[1-6]$/,
  roomPattern: /^\d{1,2}$/
};
const fixture = new URL("../fixtures/xlsx/valid-room-per-sheet.xlsx", import.meta.url);
const invalidFixture = new URL("../fixtures/xlsx/unexpected-sheets.xlsx", import.meta.url);

async function uploadFixture(path: URL, jobId: string) {
  const store = createInMemoryDirectoryStore();
  const storage = new InMemoryPrivateObjectStore();
  const result = await startAdminUpload(store, storage, {
    actor: { id: "importer-1", role: "importer" },
    filename: path.pathname.endsWith("unexpected-sheets.xlsx") ? "unexpected-sheets.xlsx" : "valid-room-per-sheet.xlsx",
    bytes: await readFile(path),
    sourceType: "approved_student_xlsx",
    academicYear: "2569",
    origin: "manual-upload",
    parserVersion: "parser-1",
    mappingVersion: "mapping-1",
    jobId
  });
  return { store, storage, result };
}

describe("async import lifecycle", () => {
  it("processes a valid upload into ready_for_review with persisted counts", async () => {
    const { store, storage, result } = await uploadFixture(fixture, "job-valid");

    const job = await processImportJob(store, storage, result.job.id, { id: "importer-1", role: "importer" }, config);

    expect(job.status).toBe("ready_for_review");
    expect(job.acceptedRowCount).toBe(3);
    expect(job.blocking).toBe(false);
    expect(store.validatedImports.get(job.id)?.students).toHaveLength(3);
    expect(store.auditEvents.map((event) => event.event)).toContain("validation_completed");
  });

  it("rejects a workbook with an unexpected sheet without changing any live dataset", async () => {
    const { store, storage, result } = await uploadFixture(invalidFixture, "job-invalid");

    const job = await processImportJob(store, storage, result.job.id, { id: "importer-1", role: "importer" }, config);

    expect(job.status).toBe("rejected");
    expect(job.blocking).toBe(true);
    expect(store.datasetVersions.size).toBe(0);
    expect(store.importIssues.some((issue) => issue.code === "UNEXPECTED_SHEET")).toBe(true);
  });
});
