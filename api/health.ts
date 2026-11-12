import type { ApiRequest, ApiResponse } from "./_lib/http.js";
import { json, method } from "./_lib/http.js";
import { getPublicHealth } from "./_lib/health.js";
import { recordTelemetry } from "./_lib/telemetry.js";

export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  if (!method(request, response, ["GET"])) return;
  const startedAt = Date.now();
  const health = await getPublicHealth();
  await recordTelemetry({ eventName: "health_check", severity: health.status === "healthy" ? "info" : "warning", route: "/api/health", statusCode: health.status === "healthy" ? 200 : 503, durationMs: Date.now() - startedAt, safeMetadata: { freshnessStatus: health.freshness.status } });
  json(response, health.status === "healthy" ? 200 : 503, health);
}
