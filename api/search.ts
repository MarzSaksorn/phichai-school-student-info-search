import { createHash, randomUUID } from "node:crypto";
import type { ApiRequest, ApiResponse } from "./_lib/http.js";
import { json, method, problem } from "./_lib/http.js";
import { allowSearch } from "./_lib/rateLimit.js";
import { publicClientKey, searchPublishedStudents } from "./_lib/publicSearch.js";
import { supabaseAdmin } from "./_lib/supabase.js";

function queryValue(value: string | string[] | undefined): string { return Array.isArray(value) ? value[0] ?? "" : value ?? ""; }
function safeQuery(request: ApiRequest): URLSearchParams { return new URLSearchParams(request.url?.split("?")[1] ?? ""); }

export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  if (!method(request, response, ["GET"])) return;
  const requestId = randomUUID();
  try {
    const params = safeQuery(request);
    const q = params.get("q") ?? "";
    const academicYear = params.get("academicYear") || undefined;
    const grade = params.get("grade") || undefined;
    const room = params.get("room") || undefined;
    const status = params.get("status") || undefined;
    const pageSizeRaw = Number(params.get("pageSize") ?? "20");
    if (!Number.isInteger(pageSizeRaw) || pageSizeRaw < 1 || pageSizeRaw > 50) { problem(response, 400, "BAD_REQUEST", "pageSize must be between 1 and 50"); return; }
    if (!q.trim() && !grade && !room) { json(response, 400, { error: "EMPTY_QUERY_NOT_ALLOWED" }); return; }
    const key = publicClientKey(request);
    const decision = allowSearch(key);
    if (!decision.allowed) { json(response, 429, { error: "RATE_LIMITED" }, { "retry-after": String(decision.retryAfter) }); return; }
    const cursor = params.get("cursor");
    const result = await searchPublishedStudents({ q, ...(academicYear ? { academicYear } : {}), ...(grade ? { grade } : {}), ...(room ? { room } : {}), ...(status ? { status } : {}), ...(cursor ? { cursor } : {}), pageSize: pageSizeRaw });
    await supabaseAdmin().schema("directory").from("audit_events").insert({ event: "search_succeeded", actor_id: `public:${createHash("sha256").update(key).digest("hex").slice(0, 24)}`, outcome: "success", request_id: requestId, safe_metadata: { queryLength: q.length, resultCount: result.items.length } });
    json(response, 200, result);
  } catch (error) {
    const code = error instanceof Error ? error.message : "SEARCH_UNAVAILABLE";
    const statusCode = code === "NO_ACTIVE_DATASET" ? 503 : code === "CURSOR_INVALID" ? 400 : 500;
    try { await supabaseAdmin().schema("directory").from("audit_events").insert({ event: "search_failed", actor_id: `public:${requestId}`, outcome: "failure", request_id: requestId, safe_metadata: { errorCode: code } }); } catch { /* audit failure must not leak details */ }
    if (code === "NO_ACTIVE_DATASET") { json(response, statusCode, { error: code }); return; }
    if (code === "CURSOR_INVALID") { json(response, statusCode, { error: code }); return; }
    problem(response, statusCode, "INTERNAL_ERROR");
  }
}
