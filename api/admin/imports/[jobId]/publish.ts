import { createHash, randomUUID } from "node:crypto";
import type { ApiRequest, ApiResponse } from "../../../_lib/http.js";
import { aggregateWorkbookValidations } from "../../../../apps/directory-worker/src/import/aggregateImports.js";
import { clientDatasetVersion } from "../../../_lib/adminView.js";
import { bearerToken, json, method, problem } from "../../../_lib/http.js";
import { PUBLIC_FIELD_CONFIG_VERSION } from "../../../_lib/publicFieldConfig.js";
import { validateSchoolWorkbookSet } from "../../../_lib/studentWorkbookSet.js";
import { authenticatedActor, supabaseAdmin } from "../../../_lib/supabase.js";
import { studentXlsxSchema } from "../../../_lib/studentSchema.js";
import { recordTelemetry } from "../../../_lib/telemetry.js";

const EXPECTED_FILE_COUNT = 6;
const INSERT_BATCH_SIZE = 500;

function getRejectedRowCount(issues: Array<{ severity: string; fileName: string; sheetName?: string; rowNumber?: number }>): number {
  const rows = new Set(issues
    .filter((issue) => issue.severity === "error" && issue.rowNumber !== undefined)
    .map((issue) => `${issue.fileName}:${issue.sheetName ?? ""}:${issue.rowNumber}`));
  return rows.size || issues.filter((issue) => issue.severity === "error").length;
}

async function markCandidateFailed(client: ReturnType<typeof supabaseAdmin>, versionId: string): Promise<void> {
  try {
    await client.schema("directory").from("dataset_versions").update({ status: "publish_failed" }).eq("id", versionId).eq("status", "ready");
  } catch { /* the candidate remains inactive even if cleanup status cannot be recorded */ }
}

async function getPublishedVersion(client: ReturnType<typeof supabaseAdmin>, versionId: string) {
  const { data } = await client.schema("directory").from("dataset_versions")
    .select("id,version,academic_year,status,student_count,warning_count,created_at,published_at")
    .eq("id", versionId).maybeSingle();
  return data;
}

export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  if (!method(request, response, ["POST"])) return;
  const startedAt = Date.now();
  let actor;
  try { actor = await authenticatedActor(bearerToken(request.headers)); } catch {
    problem(response, 503, "AUTH_UNAVAILABLE", "Server authentication is not configured");
    return;
  }
  if (!actor) { problem(response, 401, "UNAUTHORIZED", "Publisher authentication is required"); return; }
  if (!["publisher", "owner"].includes(actor.role)) { problem(response, 403, "FORBIDDEN", "Publisher role is required"); return; }

  const jobId = Array.isArray(request.query?.jobId) ? request.query?.jobId[0] : request.query?.jobId;
  if (!jobId) { problem(response, 400, "BAD_REQUEST", "Import job id is required"); return; }
  const client = supabaseAdmin();
  const { data: job, error: jobError } = await client.schema("directory").from("import_jobs")
    .select("id,status,academic_year,parser_version,mapping_version,accepted_row_count,rejected_row_count,warning_row_count,blocking,published_version_id")
    .eq("id", jobId).maybeSingle();
  if (jobError) { problem(response, 500, "INTERNAL_ERROR"); return; }
  if (!job) { problem(response, 404, "NOT_FOUND", "Import job was not found"); return; }

  if (job.status === "published" && job.published_version_id) {
    const published = await getPublishedVersion(client, job.published_version_id);
    if (!published) { problem(response, 500, "INTERNAL_ERROR", "The published dataset version could not be loaded"); return; }
    json(response, 200, { data: clientDatasetVersion(published), idempotent: true });
    return;
  }
  if (job.status !== "ready_for_review" || job.blocking) {
    problem(response, 409, "BAD_REQUEST", "Import job is not ready for publication");
    return;
  }

  let candidateId = "";
  try {
    const { data: sourceFiles, error: sourceFileError } = await client.schema("directory").from("source_files")
      .select("id,file_name,storage_path,source_type,academic_year,byte_size,checksum_sha256")
      .eq("job_id", job.id).order("file_name", { ascending: true }).limit(EXPECTED_FILE_COUNT);
    if (sourceFileError || !sourceFiles || sourceFiles.length !== EXPECTED_FILE_COUNT) {
      problem(response, 409, "BAD_REQUEST", "The reviewed job must contain all six grade workbooks.");
      return;
    }
    const setError = validateSchoolWorkbookSet(sourceFiles.map((file) => ({ filename: file.file_name })), job.academic_year);
    if (setError || sourceFiles.some((file) => file.source_type !== "approved_student_xlsx" || file.academic_year !== job.academic_year)) {
      problem(response, 409, "BAD_REQUEST", "The source workbook manifest does not match the reviewed school cohort.");
      return;
    }

    const { readWorkbook } = await import("../../../../apps/directory-worker/src/import/xlsxReader.js");
    const { validateWorkbook } = await import("../../../../apps/directory-worker/src/import/validateWorkbook.js");
    const perFile = [];
    const fileIdByName = new Map<string, string>();
    for (const sourceFile of sourceFiles) {
      const downloaded = await client.storage.from("directory-raw").download(sourceFile.storage_path);
      if (downloaded.error || !downloaded.data) throw new Error("SOURCE_DOWNLOAD_FAILED");
      const bytes = Buffer.from(await downloaded.data.arrayBuffer());
      const checksum = createHash("sha256").update(bytes).digest("hex");
      if (bytes.byteLength !== sourceFile.byte_size || checksum !== sourceFile.checksum_sha256) throw new Error("SOURCE_CHECKSUM_MISMATCH");
      const workbook = await readWorkbook({ filename: sourceFile.file_name, bytes, sourceType: "approved_student_xlsx" });
      const result = validateWorkbook(
        { workbook, fileName: sourceFile.file_name, academicYear: job.academic_year, sourceType: "approved_student_xlsx" },
        { ...studentXlsxSchema, schemaVersion: job.mapping_version, expectedAcademicYear: job.academic_year }
      );
      perFile.push({ fileName: sourceFile.file_name, result });
      fileIdByName.set(sourceFile.file_name, sourceFile.id);
    }

    const validated = aggregateWorkbookValidations(perFile);
    const rejectedRowCount = getRejectedRowCount(validated.issues);
    const warningCount = validated.issues.filter((issue) => issue.severity === "warning").length;
    if (validated.blocking || validated.students.some((student) => !student.studentIdentifier) ||
        validated.students.length !== job.accepted_row_count || rejectedRowCount !== job.rejected_row_count || warningCount !== job.warning_row_count) {
      problem(response, 409, "BAD_REQUEST", "Revalidation did not match the reviewed counts; create a new import job for review.");
      return;
    }

    const version = `${job.academic_year}.school.${job.id.slice(0, 8)}.${randomUUID().slice(0, 8)}`;
    const sourceFileIds = sourceFiles.map((file) => file.id);
    const { data: created, error: createError } = await client.schema("directory").from("dataset_versions").insert({
      version,
      academic_year: job.academic_year,
      status: "ready",
      parser_version: job.parser_version,
      mapping_version: job.mapping_version,
      field_config_version: PUBLIC_FIELD_CONFIG_VERSION,
      source_file_ids: sourceFileIds,
      student_count: validated.students.length,
      staff_count: 0,
      warning_count: warningCount,
      created_by: actor.id
    }).select("id,version,academic_year,status,student_count,warning_count,created_at,published_at").single();
    if (createError || !created) throw new Error("DATASET_VERSION_CREATE_FAILED");
    candidateId = created.id;

    const records = validated.students.map((student) => {
      const sourceFileId = fileIdByName.get(student.sourceFileName);
      if (!sourceFileId) throw new Error("SOURCE_MANIFEST_MISMATCH");
      return {
        dataset_version_id: created.id,
        public_id: student.publicId,
        display_name: student.displayName,
        search_name: student.searchName,
        student_identifier: student.studentIdentifier,
        academic_year: student.academicYear,
        grade: student.grade,
        room: student.room,
        ...(student.status ? { status: student.status } : {}),
        source_file_id: sourceFileId,
        source_sheet: student.sourceSheet,
        source_row: student.sourceRow
      };
    });
    for (let offset = 0; offset < records.length; offset += INSERT_BATCH_SIZE) {
      const batch = records.slice(offset, offset + INSERT_BATCH_SIZE);
      const { error: recordsError } = await client.schema("directory").from("published_student_records").insert(batch);
      if (recordsError) throw new Error("RECORD_INDEX_FAILED");
    }

    const { data: activatedRows, error: activationError } = await client.schema("directory").rpc("activate_school_directory_version", {
      p_version_id: created.id,
      p_job_id: job.id,
      p_actor_id: actor.id,
      p_actor_role: actor.role
    });
    if (activationError || !activatedRows) {
      const { data: currentJob } = await client.schema("directory").from("import_jobs")
        .select("status,published_version_id").eq("id", job.id).maybeSingle();
      if (currentJob?.status === "published" && currentJob.published_version_id === created.id) {
        const published = await getPublishedVersion(client, created.id);
        if (published) { json(response, 200, { data: clientDatasetVersion(published), idempotent: true }); return; }
      }
      await markCandidateFailed(client, created.id);
      problem(response, 409, "BAD_REQUEST", currentJob?.status === "published"
        ? "Another reviewed dataset was published first; this candidate was not activated."
        : "The dataset could not be activated; the previous public version was preserved.");
      return;
    }

    const active = Array.isArray(activatedRows) ? activatedRows[0] : activatedRows;
    if (!active) throw new Error("ACTIVATION_RESULT_MISSING");
    try {
      await recordTelemetry({ eventName: "request_completed", severity: "info", route: "/api/admin/imports/:jobId/publish", statusCode: 200, durationMs: Date.now() - startedAt, safeMetadata: { studentCount: validated.students.length, fileCount: sourceFiles.length } });
    } catch { /* telemetry is non-blocking after the transaction commits */ }
    json(response, 200, { data: clientDatasetVersion(active) });
  } catch (error) {
    if (candidateId) await markCandidateFailed(client, candidateId);
    const code = error instanceof Error ? error.message : "PUBLISH_FAILED";
    const status = code === "SOURCE_DOWNLOAD_FAILED" ? 503 : code === "SOURCE_CHECKSUM_MISMATCH" ? 409 : 500;
    const detail = code === "SOURCE_CHECKSUM_MISMATCH"
      ? "A private source workbook no longer matches its recorded checksum; no version was activated."
      : code === "SOURCE_DOWNLOAD_FAILED"
        ? "A private source workbook could not be loaded; no version was activated."
        : "Publication failed before activation; the previous public version was preserved.";
    try {
      await recordTelemetry({ eventName: "request_failed", severity: "error", route: "/api/admin/imports/:jobId/publish", statusCode: status, durationMs: Date.now() - startedAt, errorCode: code });
    } catch { /* telemetry must not alter publication outcome */ }
    problem(response, status, "INTERNAL_ERROR", detail);
  }
}
