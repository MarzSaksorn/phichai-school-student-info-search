import { assertAdministrator, assertRole, type Actor } from "../auth/roles.js";
import type { DirectoryStore } from "../db/client.js";
import { publishDataset } from "../jobs/publishDataset.js";
import { rollbackDataset } from "../jobs/rollbackDataset.js";
import type { ImportJob } from "../repositories/types.js";

export type AdminRouteResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: "ADMIN_ROLE_REQUIRED" | "INSUFFICIENT_ADMIN_ROLE" | "NOT_FOUND" | "REQUEST_REJECTED" };

export type AdminStatusResult =
  | { ok: true; job: ImportJob }
  | { ok: false; code: "ADMIN_ROLE_REQUIRED" | "INSUFFICIENT_ADMIN_ROLE" | "NOT_FOUND" | "REQUEST_REJECTED" };

function errorCode(error: unknown): "ADMIN_ROLE_REQUIRED" | "INSUFFICIENT_ADMIN_ROLE" | "NOT_FOUND" | "REQUEST_REJECTED" {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("Administrator role required")) return "ADMIN_ROLE_REQUIRED";
  if (message.includes("Insufficient administrator role")) return "INSUFFICIENT_ADMIN_ROLE";
  if (message.includes("not found")) return "NOT_FOUND";
  return "REQUEST_REJECTED";
}

export async function getAdminImportStatus(
  store: DirectoryStore,
  actor: Actor,
  jobId: string
): Promise<AdminStatusResult> {
  try {
    assertAdministrator(actor);
    const job = store.importJobs.get(jobId);
    if (!job) return { ok: false, code: "NOT_FOUND" };
    return { ok: true, job: structuredClone(job) };
  } catch (error) {
    return { ok: false, code: errorCode(error) };
  }
}

export async function requestPublish(
  store: DirectoryStore,
  actor: Actor,
  jobId: string,
  version: string
): Promise<AdminRouteResult<Awaited<ReturnType<typeof publishDataset>>>> {
  try {
    assertRole(actor, "publisher");
    const data = await publishDataset({ store, jobId, actor, version });
    return { ok: true, data };
  } catch (error) {
    return { ok: false, code: errorCode(error) };
  }
}

export async function requestRollback(
  store: DirectoryStore,
  actor: Actor,
  versionId: string
): Promise<AdminRouteResult<Awaited<ReturnType<typeof rollbackDataset>>>> {
  try {
    assertRole(actor, "operator");
    const data = await rollbackDataset({ store, versionId, actor });
    return { ok: true, data };
  } catch (error) {
    return { ok: false, code: errorCode(error) };
  }
}
