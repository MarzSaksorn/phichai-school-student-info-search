import type { ApiRequest, ApiResponse } from "../../../_lib/http.js";
import { bearerToken, json, method, problem } from "../../../_lib/http.js";
import { authenticatedActor, supabaseAdmin } from "../../../_lib/supabase.js";

export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  if (!method(request, response, ["POST"])) return;
  const actor = await authenticatedActor(bearerToken(request.headers));
  if (!actor) { problem(response, 401, "UNAUTHORIZED", "Operator authentication is required"); return; }
  if (!["operator", "owner"].includes(actor.role)) { problem(response, 403, "FORBIDDEN", "Operator role is required"); return; }
  const versionId = Array.isArray(request.query?.versionId) ? request.query?.versionId[0] : request.query?.versionId;
  if (!versionId) { problem(response, 400, "BAD_REQUEST", "Dataset version id is required"); return; }
  const client = supabaseAdmin();
  const { data: target } = await client.schema("directory").from("dataset_versions").select("id,status,version").eq("id", versionId).maybeSingle();
  if (!target) { problem(response, 404, "NOT_FOUND", "Dataset version was not found"); return; }
  if (target.status !== "superseded" && target.status !== "rolled_back") { problem(response, 409, "BAD_REQUEST", "Only a retained prior dataset can be restored"); return; }
  await client.schema("directory").from("dataset_versions").update({ status: "rolled_back", superseded_at: new Date().toISOString() }).eq("status", "active");
  const { data: active, error } = await client.schema("directory").from("dataset_versions").update({ status: "active", activated_by: actor.id, activated_at: new Date().toISOString() }).eq("id", versionId).select("id,version,academic_year,status,student_count,warning_count,activated_at").single();
  if (error || !active) { problem(response, 500, "INTERNAL_ERROR"); return; }
  await client.schema("directory").from("audit_events").insert({ event: "rollback_succeeded", actor_id: actor.id, actor_role: actor.role, dataset_version_id: versionId, outcome: "success", safe_metadata: { version: target.version } });
  json(response, 200, { data: active });
}
