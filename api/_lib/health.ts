import { evaluateAlerts, type Alert, type AlertSnapshot } from "../../apps/directory-worker/src/observability/alerts.js";
import { supabaseAdmin } from "./supabase.js";

export type PublicHealth = { status: "healthy" | "degraded"; checkedAt: string; freshness: { status: "fresh" | "stale" | "unknown"; publishedAt?: string; ageHours?: number } };
export type OperationsSnapshot = { checkedAt: string; health: PublicHealth; metrics: { searchRequests15m: number; searchErrors15m: number; searchP95Ms15m: number | null; publishFailures15m: number; failedImports15m: number }; alerts: Alert[] };

function isoNow(): string { return new Date().toISOString(); }
function freshness(publishedAt: string | null, now: Date): PublicHealth["freshness"] { if (!publishedAt) return { status: "unknown" }; const ageHours = Math.max(0, now.getTime() - Date.parse(publishedAt)) / 3600000; return { status: ageHours >= 24 ? "stale" : "fresh", publishedAt, ageHours: Number(ageHours.toFixed(2)) }; }

export async function getPublicHealth(): Promise<PublicHealth> {
  const checkedAt = isoNow(); const now = new Date(checkedAt);
  try {
    const { data, error } = await supabaseAdmin().schema("directory").from("dataset_versions").select("published_at").eq("status", "active").maybeSingle();
    if (error) return { status: "degraded", checkedAt, freshness: { status: "unknown" } };
    const current = freshness(data?.published_at ?? null, now);
    return { status: current.status === "stale" || current.status === "unknown" ? "degraded" : "healthy", checkedAt, freshness: current };
  } catch { return { status: "degraded", checkedAt, freshness: { status: "unknown" } }; }
}

export async function getOperationsSnapshot(): Promise<OperationsSnapshot> {
  const checkedAt = isoNow(); const since = new Date(Date.now() - 15 * 60 * 1000).toISOString(); const health = await getPublicHealth();
  const client = supabaseAdmin();
  const [telemetry, jobs, active] = await Promise.all([
    client.schema("directory").from("observability_events").select("event_name,severity,route,duration_ms,status_code").gte("occurred_at", since).limit(5000),
    client.schema("directory").from("import_jobs").select("status").gte("updated_at", since).in("status", ["publish_failed", "rejected"]).limit(1000),
    client.schema("directory").from("dataset_versions").select("published_at").eq("status", "active").maybeSingle()
  ]);
  if (telemetry.error || jobs.error || active.error) throw new Error("OPERATIONS_QUERY_FAILED");
  const events = telemetry.data ?? []; const searches = events.filter((event) => event.route === "/api/search" && event.event_name === "request_completed" && event.status_code !== 429); const searchErrors = events.filter((event) => event.event_name === "request_failed" && event.route === "/api/search"); const durations = searches.map((event) => event.duration_ms).filter((value): value is number => typeof value === "number").sort((a, b) => a - b); const p95 = durations.length ? durations[Math.min(durations.length - 1, Math.ceil(durations.length * 0.95) - 1)] ?? null : null;
  const snapshot: AlertSnapshot = { now: checkedAt, lastPublishedAt: active.data?.published_at ?? null, publishFailures15m: events.filter((event) => event.route.includes("publish") && event.severity === "error").length + (jobs.data ?? []).filter((job) => job.status === "publish_failed").length, searchRequests15m: searches.length, searchErrors15m: searchErrors.length, searchP95Ms15m: p95 };
  return { checkedAt, health, metrics: { searchRequests15m: snapshot.searchRequests15m, searchErrors15m: snapshot.searchErrors15m, searchP95Ms15m: snapshot.searchP95Ms15m, publishFailures15m: snapshot.publishFailures15m, failedImports15m: jobs.data?.length ?? 0 }, alerts: evaluateAlerts(snapshot) };
}
