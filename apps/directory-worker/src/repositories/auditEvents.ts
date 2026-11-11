import type { DirectoryStore } from "../db/client.js";
import type { AuditEvent, AuditEventInput } from "./types.js";

export async function appendAuditEvent(
  store: DirectoryStore,
  input: AuditEventInput
): Promise<AuditEvent> {
  const event: AuditEvent = {
    ...input,
    id: input.id ?? crypto.randomUUID(),
    occurredAt: input.occurredAt ?? new Date().toISOString()
  };
  store.auditEvents.push(event);
  return structuredClone(event);
}
