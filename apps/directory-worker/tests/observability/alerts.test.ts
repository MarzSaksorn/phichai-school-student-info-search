import { describe, expect, it } from "vitest";
import { evaluateAlerts, type AlertSnapshot } from "../../src/observability/alerts.js";

const base: AlertSnapshot = {
  now: "2026-11-12T01:00:00.000Z",
  lastPublishedAt: "2026-11-11T12:00:00.000Z",
  publishFailures15m: 0,
  searchRequests15m: 100,
  searchErrors15m: 0,
  searchP95Ms15m: 120
};

describe("production alert evaluation", () => {
  it("warns on stale data and escalates after the critical freshness threshold", () => {
    expect(evaluateAlerts({ ...base, lastPublishedAt: "2026-11-10T00:00:00.000Z" })).toEqual(expect.arrayContaining([expect.objectContaining({ code: "DATASET_STALE" })]));
    expect(evaluateAlerts({ ...base, lastPublishedAt: "2026-11-08T00:00:00.000Z" })).toEqual(expect.arrayContaining([expect.objectContaining({ code: "DATASET_CRITICALLY_STALE", severity: "critical" })]));
  });

  it("alerts on repeated publication failures, search errors, and slow search", () => {
    const alerts = evaluateAlerts({ ...base, publishFailures15m: 2, searchErrors15m: 8, searchP95Ms15m: 650 });
    expect(alerts.map((alert) => alert.code)).toEqual(expect.arrayContaining(["PUBLISH_FAILURES", "SEARCH_ERROR_RATE", "SEARCH_LATENCY"]));
  });

  it("does not alert when there is no traffic to calculate error rate", () => {
    expect(evaluateAlerts({ ...base, searchRequests15m: 0, searchErrors15m: 0 })).not.toEqual(expect.arrayContaining([expect.objectContaining({ code: "SEARCH_ERROR_RATE" })]));
  });
});
