import type { ApiRequest, ApiResponse } from "../../../_lib/http.js";
import { clientDatasetVersion } from "../../../_lib/adminView.js";
import { bearerToken, json, method, problem } from "../../../_lib/http.js";
import { PUBLIC_FIELD_CONFIG_VERSION } from "../../../_lib/publicFieldConfig.js";
import { authenticatedActor, supabaseAdmin } from "../../../_lib/supabase.js";
import { studentXlsxSchema } from "../../../_lib/studentSchema.js";
import { recordTelemetry } from "../../../_lib/telemetry.js";

export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  if (!method(request, response, ["POST"])) return;
  const startedAt = Date.now();
  let actor;
  try { actor = await authenticatedActor(bearerToken(request.headers)); } catch { problem(response, 503, "AUTH_UNAVAILABLE", "Server authentication is not configured"); return; }
  if (!actor) { problem(response, 401, "UNAUTHORIZED", "Publisher authentication is required"); return; }
  if (!["publisher", "owner"].includes(actor.role)) { problem(response, 403, "FORBIDDEN", "Publisher role is required"); return; }
  const jobId = Array.isArray(request.query?.jobId) ? request.query?.jobId[0] : request.query?.jobId;
  if (!jobId) { problem(response, 400, "BAD_REQUEST", "Import job id is required"); return; }
  const client = supabaseAdmin();
  const { data: job, error } = await client.schema("directory").from("import_jobs").select("id,status,academic_year,parser_version,mapping_version,accepted_row_count,rejected_row_count,warning_row_count,blocking").eq("id", jobId).maybeSingle();
  if (error) { problem(response, 500, "INTERNAL_ERROR"); return; }
  if (!job) { problem(response, 404, "NOT_FOUND", "Import job was not found"); return; }
  if (job.status !== "ready_for_review" || job.blocking) { problem(response, 409, "BAD_REQUEST", "Import job is not ready for publication"); return; }
  const version = `${job.academic_year}.${new Date().toISOString().slice(0, 10)}.${job.id.slice(0, 8)}`;
  const { data: sourceFile, error: sourceFileError } = await client.schema("directory").from("source_files").select("id,file_name,storage_path,source_type").eq("job_id", job.id).order("uploaded_at", { ascending: true }).limit(1).maybeSingle();
  if (sourceFileError) { problem(response, 500, "INTERNAL_ERROR", "The source workbook metadata could not be loaded"); return; }
  if (!sourceFile) { problem(response, 500, "INTERNAL_ERROR", "The import has no source workbook"); return; }
  const { data: created, error: createError } = await client.schema("directory").from("dataset_versions").insert({ version, academic_year: job.academic_year, status: "ready", parser_version: job.parser_version, mapping_version: job.mapping_version, field_config_version: PUBLIC_FIELD_CONFIG_VERSION, source_file_ids: [sourceFile.id], student_count: job.accepted_row_count, staff_count: 0, warning_count: job.warning_row_count, created_by: actor.id }).select("id,version,academic_year,status,student_count,warning_count,created_at").single();
  if (createError || !created) { problem(response, 500, "INTERNAL_ERROR"); return; }
  const downloaded = await client.storage.from("directory-raw").download(sourceFile.storage_path);
  if (downloaded.error || !downloaded.data) { await client.schema("directory").from("dataset_versions").update({ status: "publish_failed" }).eq("id", created.id); problem(response, 503, "INTERNAL_ERROR"); return; }
  const { readWorkbook } = await import("../../../../apps/directory-worker/src/import/xlsxReader.js");
  const { validateWorkbook } = await import("../../../../apps/directory-worker/src/import/validateWorkbook.js");
  const workbook = await readWorkbook({ filename: sourceFile.file_name, bytes: Buffer.from(await downloaded.data.arrayBuffer()), sourceType: "approved_student_xlsx" });
  const validated = validateWorkbook({ workbook, fileName: sourceFile.file_name, academicYear: job.academic_year, sourceType: "approved_student_xlsx" }, { ...studentXlsxSchema, schemaVersion: job.mapping_version, expectedAcademicYear: job.academic_year });
  if (validated.blocking) { await client.schema("directory").from("dataset_versions").update({ status: "publish_failed" }).eq("id", created.id); problem(response, 409, "BAD_REQUEST", "A blocking validation result prevents publication"); return; }
  const { error: recordsError } = await client.schema("directory").from("published_student_records").insert(validated.students.map((student) => ({ dataset_version_id: created.id, public_id: student.publicId, display_name: student.displayName, search_name: student.searchName, ...(student.studentIdentifier ? { student_identifier: student.studentIdentifier } : {}), academic_year: student.academicYear, grade: student.grade, room: student.room, ...(student.status ? { status: student.status } : {}), source_file_id: sourceFile.id, source_sheet: student.sourceSheet, source_row: student.sourceRow })));
  if (recordsError) { await client.schema("directory").from("dataset_versions").update({ status: "publish_failed" }).eq("id", created.id); problem(response, 500, "INTERNAL_ERROR"); return; }
  const { error: deactivateError } = await client.schema("directory").from("dataset_versions").update({ status: "superseded", superseded_at: new Date().toISOString() }).eq("status", "active");
  if (deactivateError) { await client.schema("directory").from("dataset_versions").update({ status: "publish_failed" }).eq("id", created.id); problem(response, 500, "INTERNAL_ERROR"); return; }
  const { data: active, error: activateError } = await client.schema("directory").from("dataset_versions").update({ status: "active", activated_by: actor.id, activated_at: new Date().toISOString(), published_at: new Date().toISOString() }).eq("id", created.id).select("id,version,academic_year,status,student_count,warning_count,created_at,published_at").single();
  if (activateError || !active) { await client.schema("directory").from("dataset_versions").update({ status: "publish_failed" }).eq("id", created.id); problem(response, 500, "INTERNAL_ERROR"); return; }
  await client.schema("directory").from("import_jobs").update({ status: "published", published_version_id: created.id, updated_at: new Date().toISOString() }).eq("id", jobId);
  await client.schema("directory").from("audit_events").insert({ event: "publish_succeeded", actor_id: actor.id, actor_role: actor.role, job_id: jobId, dataset_version_id: created.id, outcome: "success", safe_metadata: { version, studentCount: job.accepted_row_count } });
  await recordTelemetry({ eventName: "request_completed", severity: "info", route: "/api/admin/imports/:jobId/publish", statusCode: 200, durationMs: Date.now() - startedAt, safeMetadata: { studentCount: job.accepted_row_count } });
  json(response, 200, { data: clientDatasetVersion(active) });
}
