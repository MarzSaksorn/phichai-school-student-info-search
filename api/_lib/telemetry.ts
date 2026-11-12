import { supabaseAdmin } from "./supabase.js";

export type TelemetrySeverity = "info" | "warning" | "error" | "critical";
export type TelemetryEventName = "request_completed" | "request_failed" | "rate_limited" | "health_check" | "alert_evaluated";
export type TelemetryEventInput = { eventName: TelemetryEventName; severity: TelemetrySeverity; route: string; requestId?: string; statusCode?: number; durationMs?: number; errorCode?: string; safeMetadata?: Record<string, string | number | boolean> };

function safeMetadata(input: Record<string, string | number | boolean> | undefined): Record<string, string | number | boolean> {
  if (!input) return {};
  return Object.fromEntries(Object.entries(input).filter(([key, value]) => /^[a-zA-Z][a-zA-Z0-9_]{0,31}$/.test(key) && ["string", "number", "boolean"].includes(typeof value)).slice(0, 20));
}

export async function recordTelemetry(event: TelemetryEventInput): Promise<void> {
  const payload = { ...event, safeMetadata: safeMetadata(event.safeMetadata) };
  try { console.log(JSON.stringify({ type: "phichai_telemetry", ...payload })); } catch { /* logging must not break the request */ }
  try {
    await supabaseAdmin().schema("directory").from("observability_events").insert({ event_name: payload.eventName, severity: payload.severity, ...(payload.requestId ? { request_id: payload.requestId } : {}), route: payload.route, ...(payload.statusCode !== undefined ? { status_code: payload.statusCode } : {}), ...(payload.durationMs !== undefined ? { duration_ms: Math.max(0, Math.round(payload.durationMs)) } : {}), ...(payload.errorCode ? { error_code: payload.errorCode } : {}), safe_metadata: payload.safeMetadata });
  } catch { /* telemetry is best effort and must never change API behavior */ }
}

export function elapsedMs(startedAt: number): number { return Math.max(0, Date.now() - startedAt); }
