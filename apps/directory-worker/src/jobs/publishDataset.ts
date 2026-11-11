import { randomUUID } from "node:crypto";
import { assertRole, auditActorRole, type Actor } from "../auth/roles.js";
import type { DirectoryStore } from "../db/client.js";
import { appendAuditEvent } from "../repositories/auditEvents.js";
import {
  activateDatasetVersion,
  createDatasetVersion
} from "../repositories/datasetVersions.js";
import { updateImportJobStatus } from "../repositories/importJobs.js";
import type { DatasetVersion } from "../repositories/types.js";
import type { NormalizedStudent } from "../import/normalizeStudent.js";
import type { SearchIndex } from "../search/searchIndex.js";

export type PublishDatasetInput = {
  store: DirectoryStore;
  jobId: string;
  actor: Actor;
  version: string;
  indexRecords?: (versionId: string, students: NormalizedStudent[]) => Promise<void>;
  searchIndex?: SearchIndex;
};

export async function publishDataset(input: PublishDatasetInput): Promise<DatasetVersion> {
  assertRole(input.actor, "publisher");
  const job = input.store.importJobs.get(input.jobId);
  if (!job) throw new Error("Import job not found");
  if (job.status !== "ready_for_review") {
    throw new Error("Import job is not ready for publication");
  }
  const validated = input.store.validatedImports.get(input.jobId);
  if (!validated || validated.blocking) {
    throw new Error("A blocking validation result prevents publication");
  }

  await updateImportJobStatus(input.store, input.jobId, "publishing");
  const version = await createDatasetVersion(input.store, {
    id: randomUUID(),
    version: input.version,
    academicYear: job.academicYear,
    parserVersion: job.parserVersion,
    mappingVersion: job.mappingVersion,
    sourceFileIds: [...job.sourceFileIds],
    studentCount: validated.students.length,
    staffCount: 0,
    warningCount: validated.issues.filter((issue) => issue.severity === "warning").length,
    createdBy: input.actor.id
  });

  try {
    await updateImportJobStatus(input.store, input.jobId, "indexing");
    await input.indexRecords?.(version.id, validated.students);
    await input.searchIndex?.replaceVersion(version.id, validated.students);
    input.store.normalizedStudents.set(version.id, structuredClone(validated.students));
    const storedVersion = input.store.datasetVersions.get(version.id);
    if (!storedVersion) throw new Error("Dataset version disappeared during indexing");
    storedVersion.status = "ready";
    await activateDatasetVersion(input.store, version.id, input.actor.id);
    job.publishedVersionId = version.id;
    await updateImportJobStatus(input.store, input.jobId, "published");
    await appendAuditEvent(input.store, {
      event: "publish_succeeded",
      actorId: input.actor.id,
      ...auditActorRole(input.actor),
      jobId: input.jobId,
      datasetVersionId: version.id,
      outcome: "success",
      safeMetadata: { version: input.version, studentCount: validated.students.length }
    });
    return structuredClone(input.store.datasetVersions.get(version.id) as DatasetVersion);
  } catch (error) {
    const failedVersion = input.store.datasetVersions.get(version.id);
    if (failedVersion && failedVersion.status !== "active") {
      failedVersion.status = "publish_failed";
    }
    await updateImportJobStatus(input.store, input.jobId, "publish_failed");
    await appendAuditEvent(input.store, {
      event: "publish_failed",
      actorId: input.actor.id,
      ...auditActorRole(input.actor),
      jobId: input.jobId,
      datasetVersionId: version.id,
      outcome: "failure",
      safeMetadata: { failure: error instanceof Error ? error.message : "publish_failed" }
    });
    throw error;
  }
}
