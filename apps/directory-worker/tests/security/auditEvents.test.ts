import { describe, expect, it } from "vitest";
import { createInMemoryDirectoryStore } from "../../src/db/client.js";
import { appendAuditEvent } from "../../src/repositories/auditEvents.js";

describe("security audit events", () => {
  it("accepts search security events with safe scalar metadata only", async () => {
    const store = createInMemoryDirectoryStore();
    const event = await appendAuditEvent(store, {
      event: "search_requested",
      actorId: "public:hashed-client",
      outcome: "success",
      requestId: "req-1",
      safeMetadata: { queryLength: 4, resultCount: 2, durationMs: 12 }
    });

    expect(event.event).toBe("search_requested");
    expect(event.safeMetadata).toEqual({ queryLength: 4, resultCount: 2, durationMs: 12 });
    expect(JSON.stringify(event)).not.toContain("student");
    expect(JSON.stringify(event)).not.toContain("001");
  });
});
