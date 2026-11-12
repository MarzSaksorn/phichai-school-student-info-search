export type AlertSeverity = "warning" | "critical";
export type AlertCode = "DATASET_STALE" | "DATASET_CRITICALLY_STALE" | "PUBLISH_FAILURES" | "SEARCH_ERROR_RATE" | "SEARCH_LATENCY";
export type Alert = { code: AlertCode; severity: AlertSeverity; message: string; observedValue: number; threshold: number };
export type AlertSnapshot = { now: string; lastPublishedAt: string | null; publishFailures15m: number; searchRequests15m: number; searchErrors15m: number; searchP95Ms15m: number | null };

const HOUR = 60 * 60 * 1000;

export function evaluateAlerts(snapshot: AlertSnapshot, now = new Date(snapshot.now)): Alert[] {
  const alerts: Alert[] = [];
  const publishedAt = snapshot.lastPublishedAt ? Date.parse(snapshot.lastPublishedAt) : Number.NaN;
  const ageHours = Number.isFinite(publishedAt) ? Math.max(0, now.getTime() - publishedAt) / HOUR : Number.POSITIVE_INFINITY;
  if (ageHours >= 72 || !Number.isFinite(publishedAt)) alerts.push({ code: "DATASET_CRITICALLY_STALE", severity: "critical", message: "The directory has no publish freshness within the critical window", observedValue: Number.isFinite(ageHours) ? ageHours : -1, threshold: 72 });
  else if (ageHours >= 24) alerts.push({ code: "DATASET_STALE", severity: "warning", message: "The active directory dataset is older than the freshness target", observedValue: ageHours, threshold: 24 });
  if (snapshot.publishFailures15m >= 2) alerts.push({ code: "PUBLISH_FAILURES", severity: "critical", message: "Repeated publication failures detected in the last 15 minutes", observedValue: snapshot.publishFailures15m, threshold: 2 });
  const errorRate = snapshot.searchRequests15m > 0 ? snapshot.searchErrors15m / snapshot.searchRequests15m : 0;
  if (snapshot.searchRequests15m > 0 && errorRate >= 0.05) alerts.push({ code: "SEARCH_ERROR_RATE", severity: "critical", message: "Search error rate exceeded the operational threshold", observedValue: errorRate, threshold: 0.05 });
  if (snapshot.searchP95Ms15m !== null && snapshot.searchP95Ms15m > 500) alerts.push({ code: "SEARCH_LATENCY", severity: "warning", message: "Search p95 latency exceeded the target", observedValue: snapshot.searchP95Ms15m, threshold: 500 });
  return alerts;
}
