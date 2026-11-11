import type { DirectoryStore } from "../db/client.js";
import type {
  CreateDatasetVersionInput,
  DatasetVersion
} from "./types.js";

const now = (): string => new Date().toISOString();

export async function createDatasetVersion(
  store: DirectoryStore,
  input: CreateDatasetVersionInput
): Promise<DatasetVersion> {
  if (store.datasetVersions.has(input.id)) {
    throw new Error("Dataset version already exists");
  }
  if ([...store.datasetVersions.values()].some((version) => version.version === input.version)) {
    throw new Error("Dataset version identifier already exists");
  }

  const version: DatasetVersion = {
    ...input,
    status: input.status ?? "building",
    createdAt: now()
  };
  store.datasetVersions.set(version.id, version);
  return structuredClone(version);
}

export async function getActiveDatasetVersion(
  store: DirectoryStore
): Promise<DatasetVersion | undefined> {
  const active = [...store.datasetVersions.values()].find((version) => version.status === "active");
  return active ? structuredClone(active) : undefined;
}

export async function activateDatasetVersion(
  store: DirectoryStore,
  versionId: string,
  actorId: string
): Promise<void> {
  const target = store.datasetVersions.get(versionId);
  if (!target) {
    throw new Error("Dataset version not found");
  }
  if (target.status === "publish_failed" || target.status === "rolled_back") {
    throw new Error("Dataset version cannot be activated from its current status");
  }

  // Validate all preconditions before mutating the active pointer. This mirrors
  // the transaction boundary that the Supabase repository will use.
  const current = [...store.datasetVersions.values()].find((version) => version.status === "active");
  const timestamp = now();
  if (current && current.id !== target.id) {
    current.status = "superseded";
    current.supersededAt = timestamp;
  }
  target.status = "active";
  target.activatedBy = actorId;
  target.activatedAt = timestamp;
  target.publishedAt ??= timestamp;
}

export async function rollbackDatasetVersion(
  store: DirectoryStore,
  versionId: string,
  actorId: string
): Promise<void> {
  const target = store.datasetVersions.get(versionId);
  if (!target) {
    throw new Error("Dataset version not found");
  }
  if (target.status === "building" || target.status === "publish_failed") {
    throw new Error("Only a retained published version can be restored");
  }

  const current = [...store.datasetVersions.values()].find((version) => version.status === "active");
  if (current?.id === target.id) {
    throw new Error("Dataset version is already active");
  }

  const timestamp = now();
  if (current) {
    current.status = "rolled_back";
    current.supersededAt = timestamp;
  }
  target.status = "active";
  target.activatedBy = actorId;
  target.activatedAt = timestamp;
}
