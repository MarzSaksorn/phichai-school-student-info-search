import { assertRole, auditActorRole, type Actor } from "../auth/roles.js";
import type { DirectoryStore } from "../db/client.js";
import { appendAuditEvent } from "../repositories/auditEvents.js";
import { getActiveDatasetVersion, rollbackDatasetVersion } from "../repositories/datasetVersions.js";
import type { DatasetVersion } from "../repositories/types.js";

export type RollbackDatasetInput = {
  store: DirectoryStore;
  versionId: string;
  actor: Actor;
};

export async function rollbackDataset(input: RollbackDatasetInput): Promise<DatasetVersion> {
  assertRole(input.actor, "operator");
  await appendAuditEvent(input.store, {
    event: "rollback_requested",
    actorId: input.actor.id,
    ...auditActorRole(input.actor),
    datasetVersionId: input.versionId,
    outcome: "success"
  });
  await rollbackDatasetVersion(input.store, input.versionId, input.actor.id);
  const active = await getActiveDatasetVersion(input.store);
  if (!active) throw new Error("No active dataset version after rollback");
  await appendAuditEvent(input.store, {
    event: "rollback_succeeded",
    actorId: input.actor.id,
    ...auditActorRole(input.actor),
    datasetVersionId: active.id,
    outcome: "success"
  });
  return active;
}
