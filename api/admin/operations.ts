import type { ApiRequest, ApiResponse } from "../_lib/http.js";
import { bearerToken, json, method, problem } from "../_lib/http.js";
import { getOperationsSnapshot } from "../_lib/health.js";
import { authenticatedActor } from "../_lib/supabase.js";
import { elapsedMs, recordTelemetry } from "../_lib/telemetry.js";

export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  if (!method(request, response, ["GET"])) return;
  const actor = await authenticatedActor(bearerToken(request.headers));
  if (!actor) { problem(response, 401, "UNAUTHORIZED", "Administrator authentication is required"); return; }
  if (!["operator", "owner"].includes(actor.role)) { problem(response, 403, "FORBIDDEN", "Operator role is required"); return; }
  const startedAt = Date.now();
  try {
    const snapshot = await getOperationsSnapshot();
    await recordTelemetry({ eventName: "alert_evaluated", severity: snapshot.alerts.some((alert) => alert.severity === "critical") ? "critical" : snapshot.alerts.length ? "warning" : "info", route: "/api/admin/operations", statusCode: 200, durationMs: elapsedMs(startedAt), safeMetadata: { alertCount: snapshot.alerts.length, criticalAlertCount: snapshot.alerts.filter((alert) => alert.severity === "critical").length } });
    json(response, 200, snapshot);
  } catch {
    await recordTelemetry({ eventName: "request_failed", severity: "error", route: "/api/admin/operations", statusCode: 500, durationMs: elapsedMs(startedAt), errorCode: "OPERATIONS_UNAVAILABLE" });
    problem(response, 500, "INTERNAL_ERROR");
  }
}
