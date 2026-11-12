import type { ApiRequest, ApiResponse } from "../../_lib/http.js";
import { clientImportJob } from "../../_lib/adminView.js";
import { bearerToken, json, method, problem } from "../../_lib/http.js";
import { authenticatedActor, supabaseAdmin } from "../../_lib/supabase.js";

const columns = "id,status,source_type,academic_year,parser_version,mapping_version,accepted_row_count,rejected_row_count,warning_row_count,blocking,published_version_id,created_at,updated_at";

export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  if (!method(request, response, ["GET"])) return;
  const actor = await authenticatedActor(bearerToken(request.headers));
  if (!actor) { problem(response, 401, "UNAUTHORIZED", "Administrator authentication is required"); return; }
  if (!["importer", "publisher", "operator", "owner"].includes(actor.role)) { problem(response, 403, "FORBIDDEN", "Administrator role is insufficient"); return; }
  const jobId = Array.isArray(request.query?.jobId) ? request.query?.jobId[0] : request.query?.jobId;
  if (!jobId) { problem(response, 400, "BAD_REQUEST", "Import job id is required"); return; }
  const { data: job, error } = await supabaseAdmin().schema("directory").from("import_jobs").select(columns).eq("id", jobId).maybeSingle();
  if (error) { problem(response, 500, "INTERNAL_ERROR"); return; }
  if (!job) { problem(response, 404, "NOT_FOUND", "Import job was not found"); return; }
  const { data: issues } = await supabaseAdmin().schema("directory").from("import_issues").select("id,severity,code,file_name,sheet_name,row_number,safe_message,created_at").eq("job_id", jobId).order("created_at", { ascending: true }).limit(100);
  json(response, 200, { job: clientImportJob(job), issues: issues ?? [] });
}
