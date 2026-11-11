import type { DirectoryStore } from "../db/client.js";
import type { CreateImportJobInput, ImportIssueInput, ImportJob } from "./types.js";

const now = (): string => new Date().toISOString();

export async function createImportJob(
  store: DirectoryStore,
  input: CreateImportJobInput
): Promise<ImportJob> {
  if (store.importJobs.has(input.id)) {
    throw new Error("Import job already exists");
  }

  const timestamp = now();
  const job: ImportJob = {
    ...input,
    status: "uploaded",
    acceptedRowCount: 0,
    rejectedRowCount: 0,
    warningRowCount: 0,
    blocking: false,
    createdAt: timestamp,
    updatedAt: timestamp
  };
  store.importJobs.set(job.id, job);
  return structuredClone(job);
}

export async function recordImportIssue(
  store: DirectoryStore,
  input: ImportIssueInput
): Promise<void> {
  if (!store.importJobs.has(input.jobId)) {
    throw new Error("Import job not found");
  }

  const issue = {
    ...input,
    id: input.id ?? crypto.randomUUID(),
    createdAt: now()
  };
  store.importIssues.push(issue);

  const job = store.importJobs.get(input.jobId);
  if (job && input.severity === "error") {
    job.blocking = true;
    job.rejectedRowCount += 1;
    job.updatedAt = now();
  } else if (job && input.severity === "warning") {
    job.warningRowCount += 1;
    job.updatedAt = now();
  }
}

export async function updateImportJobStatus(
  store: DirectoryStore,
  jobId: string,
  status: ImportJob["status"]
): Promise<ImportJob> {
  const job = store.importJobs.get(jobId);
  if (!job) {
    throw new Error("Import job not found");
  }
  job.status = status;
  job.updatedAt = now();
  return structuredClone(job);
}

export async function updateImportJobSummary(
  store: DirectoryStore,
  jobId: string,
  summary: Pick<ImportJob, "acceptedRowCount" | "rejectedRowCount" | "warningRowCount" | "blocking">
): Promise<ImportJob> {
  const job = store.importJobs.get(jobId);
  if (!job) throw new Error("Import job not found");
  Object.assign(job, summary, { updatedAt: now() });
  return structuredClone(job);
}
