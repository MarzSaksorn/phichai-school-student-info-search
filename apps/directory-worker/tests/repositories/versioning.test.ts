import { describe, expect, it } from "vitest";
import { createInMemoryDirectoryStore } from "../../src/db/client.js";
import { createImportJob, recordImportIssue } from "../../src/repositories/importJobs.js";
import {
  activateDatasetVersion,
  createDatasetVersion,
  getActiveDatasetVersion,
  rollbackDatasetVersion
} from "../../src/repositories/datasetVersions.js";
import { appendAuditEvent } from "../../src/repositories/auditEvents.js";

describe("directory versioning repositories", () => {
  it("creates an import job and records restricted issues", async () => {
    const store = createInMemoryDirectoryStore();
    const job = await createImportJob(store, {
      id: "job-1",
      sourceType: "approved_student_xlsx",
      academicYear: "2569",
      parserVersion: "parser-1",
      mappingVersion: "mapping-1",
      uploaderId: "admin-1",
      sourceFileIds: ["file-1"]
    });

    await recordImportIssue(store, {
      jobId: job.id,
      severity: "error",
      code: "BLANK_NAME",
      fileName: "students.xlsx",
      sheetName: "M1-1",
      rowNumber: 4,
      safeMessage: "Display name is required."
    });

    expect(job.status).toBe("uploaded");
    expect(store.importIssues).toHaveLength(1);
    expect(store.importIssues[0]?.safeMessage).toBe("Display name is required.");
  });

  it("activates one immutable version and preserves the old version on failed switches", async () => {
    const store = createInMemoryDirectoryStore();
    const first = await createDatasetVersion(store, {
      id: "version-1",
      version: "2569.1",
      academicYear: "2569",
      parserVersion: "parser-1",
      mappingVersion: "mapping-1",
      sourceFileIds: ["file-1"],
      studentCount: 10,
      staffCount: 2,
      warningCount: 0,
      createdBy: "admin-1"
    });
    await activateDatasetVersion(store, first.id, "publisher-1");

    const second = await createDatasetVersion(store, {
      id: "version-2",
      version: "2569.2",
      academicYear: "2569",
      parserVersion: "parser-1",
      mappingVersion: "mapping-1",
      sourceFileIds: ["file-2"],
      studentCount: 11,
      staffCount: 2,
      warningCount: 1,
      createdBy: "admin-1"
    });
    await expect(activateDatasetVersion(store, second.id, "publisher-1")).resolves.toBeUndefined();

    expect((await getActiveDatasetVersion(store))?.id).toBe("version-2");
    expect(store.datasetVersions.get("version-1")?.status).toBe("superseded");
    expect(store.datasetVersions.get("version-2")?.status).toBe("active");

    await expect(activateDatasetVersion(store, "missing", "publisher-1")).rejects.toThrow(
      "Dataset version not found"
    );
    expect((await getActiveDatasetVersion(store))?.id).toBe("version-2");
  });

  it("rolls back to a prior version without deleting audit history", async () => {
    const store = createInMemoryDirectoryStore();
    for (const version of ["version-1", "version-2"]) {
      await createDatasetVersion(store, {
        id: version,
        version,
        academicYear: "2569",
        parserVersion: "parser-1",
        mappingVersion: "mapping-1",
        sourceFileIds: [],
        studentCount: 1,
        staffCount: 0,
        warningCount: 0,
        createdBy: "admin-1"
      });
    }
    await activateDatasetVersion(store, "version-1", "publisher-1");
    await activateDatasetVersion(store, "version-2", "publisher-1");
    await appendAuditEvent(store, {
      event: "publish_succeeded",
      actorId: "publisher-1",
      datasetVersionId: "version-2",
      outcome: "success"
    });

    await rollbackDatasetVersion(store, "version-1", "operator-1");

    expect((await getActiveDatasetVersion(store))?.id).toBe("version-1");
    expect(store.datasetVersions.get("version-2")?.status).toBe("rolled_back");
    expect(store.auditEvents).toHaveLength(1);
  });
});
