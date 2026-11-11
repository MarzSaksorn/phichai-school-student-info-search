import { assertRole, auditActorRole, type Actor } from "../auth/roles.js";
import type { ImportSchemaConfig } from "../import/schemaRules.js";
import { validateWorkbook } from "../import/validateWorkbook.js";
import { readWorkbook } from "../import/xlsxReader.js";
import { appendAuditEvent } from "../repositories/auditEvents.js";
import {
  recordImportIssue,
  updateImportJobStatus,
  updateImportJobSummary
} from "../repositories/importJobs.js";
import type { DirectoryStore } from "../db/client.js";
import type { PrivateObjectStore } from "../storage/privateObjectStore.js";
import type { ImportJob } from "../repositories/types.js";

export async function processImportJob(
  store: DirectoryStore,
  storage: PrivateObjectStore,
  jobId: string,
  actor: Actor,
  schemaConfig: ImportSchemaConfig
): Promise<ImportJob> {
  assertRole(actor, "importer");
  const job = store.importJobs.get(jobId);
  if (!job) throw new Error("Import job not found");
  if (job.status !== "uploaded") return structuredClone(job);

  await updateImportJobStatus(store, jobId, "scanning");
  try {
    const sourceFileId = job.sourceFileIds[0];
    const sourceFile = sourceFileId ? store.sourceFiles.get(sourceFileId) : undefined;
    if (!sourceFile) throw new Error("Source file metadata not found");

    const bytes = await storage.readPrivateSource(sourceFile.storagePath);
    const workbook = await readWorkbook({
      filename: sourceFile.fileName,
      bytes,
      sourceType: sourceFile.sourceType
    });
    if (workbook.fileId !== sourceFile.id || workbook.checksum !== sourceFile.checksumSha256) {
      throw new Error("Source checksum changed after upload");
    }

    await updateImportJobStatus(store, jobId, "validating");
    const validated = validateWorkbook(
      {
        workbook,
        fileName: sourceFile.fileName,
        academicYear: job.academicYear,
        sourceType: job.sourceType
      },
      schemaConfig
    );
    store.validatedImports.set(jobId, structuredClone(validated));

    for (const validationIssue of validated.issues) {
      await recordImportIssue(store, {
        jobId,
        severity: validationIssue.severity,
        code: validationIssue.code,
        fileId: sourceFile.id,
        fileName: validationIssue.fileName,
        ...(validationIssue.sheetName ? { sheetName: validationIssue.sheetName } : {}),
        ...(validationIssue.rowNumber ? { rowNumber: validationIssue.rowNumber } : {}),
        safeMessage: validationIssue.message
      });
    }

    const errorRows = new Set(
      validated.issues
        .filter((issue) => issue.severity === "error" && issue.rowNumber !== undefined)
        .map((issue) => `${issue.sheetName ?? ""}:${issue.rowNumber}`)
    );
    const rejectedRowCount = errorRows.size > 0
      ? errorRows.size
      : validated.issues.filter((issue) => issue.severity === "error").length;
    await updateImportJobSummary(store, jobId, {
      acceptedRowCount: validated.students.length,
      rejectedRowCount,
      warningRowCount: validated.issues.filter((issue) => issue.severity === "warning").length,
      blocking: validated.blocking
    });

    const nextStatus = validated.blocking ? "rejected" : "ready_for_review";
    await updateImportJobStatus(store, jobId, nextStatus);
    await appendAuditEvent(store, {
      event: "validation_completed",
      actorId: actor.id,
      ...auditActorRole(actor),
      jobId,
      outcome: validated.blocking ? "failure" : "success",
      safeMetadata: {
        acceptedRowCount: validated.students.length,
        rejectedRowCount,
        warningRowCount: validated.issues.filter((issue) => issue.severity === "warning").length
      }
    });
    return structuredClone(store.importJobs.get(jobId) as ImportJob);
  } catch (error) {
    await updateImportJobStatus(store, jobId, "rejected");
    await updateImportJobSummary(store, jobId, {
      acceptedRowCount: 0,
      rejectedRowCount: 1,
      warningRowCount: 0,
      blocking: true
    });
    await appendAuditEvent(store, {
      event: "validation_completed",
      actorId: actor.id,
      ...auditActorRole(actor),
      jobId,
      outcome: "failure",
      safeMetadata: { failure: error instanceof Error ? error.message : "validation_failed" }
    });
    return structuredClone(store.importJobs.get(jobId) as ImportJob);
  }
}
