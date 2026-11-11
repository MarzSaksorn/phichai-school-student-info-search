import { randomUUID } from "node:crypto";
import { readWorkbook } from "../import/xlsxReader.js";
import { assertRole, type Actor } from "../auth/roles.js";
import { appendAuditEvent } from "../repositories/auditEvents.js";
import { createImportJob, updateImportJobStatus } from "../repositories/importJobs.js";
import { createSourceFile } from "../repositories/sourceFiles.js";
import type { DirectoryStore } from "../db/client.js";
import type { SourceType, ImportJob, SourceFile } from "../repositories/types.js";
import type { PrivateObjectStore } from "../storage/privateObjectStore.js";

export type AdminUploadInput = {
  actor: Actor;
  filename: string;
  bytes: Uint8Array;
  sourceType: SourceType;
  academicYear: string;
  origin?: string;
  contentType?: string;
  parserVersion: string;
  mappingVersion: string;
  jobId?: string;
};

export type AdminUploadResult = {
  job: ImportJob;
  sourceFile: SourceFile;
  fileId: string;
  checksum: string;
  sheetNames: string[];
  rowCount: number;
};

export async function startAdminUpload(
  store: DirectoryStore,
  storage: PrivateObjectStore,
  input: AdminUploadInput
): Promise<AdminUploadResult> {
  assertRole(input.actor, "importer");

  // readWorkbook enforces the approved XLSX source boundary before storage is touched.
  const fileInput = {
    filename: input.filename,
    bytes: input.bytes,
    sourceType: input.sourceType
  } as const;
  const workbook = await readWorkbook(
    input.contentType || input.origin
      ? { ...fileInput, ...(input.contentType ? { contentType: input.contentType } : {}), ...(input.origin ? { origin: input.origin } : {}) }
      : fileInput
  );
  const jobId = input.jobId ?? randomUUID();
  const storageRef = await storage.putPrivateSource({
    fileId: workbook.fileId,
    academicYear: input.academicYear,
    jobId,
    filename: input.filename,
    bytes: input.bytes
  });

  let job: ImportJob | undefined;
  try {
    job = await createImportJob(store, {
      id: jobId,
      sourceType: input.sourceType,
      academicYear: input.academicYear,
      parserVersion: input.parserVersion,
      mappingVersion: input.mappingVersion,
      uploaderId: input.actor.id,
      sourceFileIds: [workbook.fileId]
    });
    const sourceFile = await createSourceFile(store, {
      id: workbook.fileId,
      jobId,
      fileName: input.filename,
      contentType:
        input.contentType ??
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      byteSize: storageRef.byteSize,
      checksumSha256: storageRef.checksum,
      storagePath: storageRef.objectKey,
      academicYear: input.academicYear,
      sourceType: input.sourceType,
      uploadedBy: input.actor.id
    });
    const auditInput = {
      event: "upload",
      actorId: input.actor.id,
      jobId,
      outcome: "success",
      safeMetadata: {
        fileId: workbook.fileId,
        byteSize: storageRef.byteSize,
        sheetCount: workbook.sheets.length
      }
    } as const;
    await appendAuditEvent(store, {
      ...auditInput,
      ...(input.actor.role === "public" ? {} : { actorRole: input.actor.role })
    });

    return {
      job,
      sourceFile,
      fileId: workbook.fileId,
      checksum: workbook.checksum,
      sheetNames: workbook.sheets.map((sheet) => sheet.name),
      rowCount: workbook.sheets.reduce((total, sheet) => total + sheet.rows.length, 0)
    };
  } catch (error) {
    if (job) {
      await updateImportJobStatus(store, job.id, "rejected");
    }
    if (storage.deletePrivateSource) {
      await storage.deletePrivateSource(storageRef.objectKey);
    }
    throw error;
  }
}
