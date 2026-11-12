import { randomUUID, createHash } from "node:crypto";
import Busboy from "busboy";
import type { IncomingMessage } from "node:http";
import { aggregateWorkbookValidations } from "../../apps/directory-worker/src/import/aggregateImports.js";
import type { ImportSchemaConfig } from "../../apps/directory-worker/src/import/schemaRules.js";
import type { ReadWorkbookResult } from "../../apps/directory-worker/src/import/xlsxReader.js";
import type { ApiRequest, ApiResponse } from "../_lib/http.js";
import { bearerToken, json, method, problem } from "../_lib/http.js";
import { clientImportJob } from "../_lib/adminView.js";
import { authenticatedActor, supabaseAdmin } from "../_lib/supabase.js";
import { STUDENT_XLSX_MAPPING_VERSION, studentXlsxSchema } from "../_lib/studentSchema.js";
import { validateSchoolWorkbookSet } from "../_lib/studentWorkbookSet.js";
import { recordTelemetry } from "../_lib/telemetry.js";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const MAX_FILE_BYTES = 3 * 1024 * 1024;
const MAX_TOTAL_BYTES = 4 * 1024 * 1024;
const MAX_WORKBOOKS = 6;
const schema: ImportSchemaConfig = studentXlsxSchema;

type UploadedWorkbook = { bytes: Buffer; filename: string };
type Upload = {
  files: UploadedWorkbook[];
  academicYear: string;
  mappingVersion: string;
  sourceType: string;
};

type PreparedWorkbook = UploadedWorkbook & {
  id: string;
  checksum: string;
  storagePath: string;
  workbook: ReadWorkbookResult;
};

const uploadErrorMessage: Record<string, string> = {
  BAD_REQUEST: "A valid XLSX multipart upload is required.",
  FILE_TOO_LARGE: "Each workbook must be at most 3 MiB and all six together at most 4 MiB.",
  TOO_MANY_FILES: "Select exactly six workbooks, one for each grade M.1–M.6.",
  UNEXPECTED_FILE_FIELD: "Upload the six workbooks using the approved file picker.",
  ALL_SIX_GRADE_WORKBOOKS_REQUIRED: "Select exactly one approved workbook for each grade M.1 through M.6.",
  SCHOOL_WORKBOOK_NAME_INVALID: "The source files must use the approved M.1–M.6 workbook naming pattern.",
  SCHOOL_WORKBOOK_YEAR_MISMATCH: "The workbook filename year does not match the selected academic year.",
  DUPLICATE_GRADE_WORKBOOK: "Select exactly one workbook for each grade; duplicate grades are not allowed."
};

function parseMultipart(request: IncomingMessage): Promise<Upload> {
  return new Promise((resolve, reject) => {
    const contentType = request.headers["content-type"];
    if (typeof contentType !== "string" || !contentType.startsWith("multipart/form-data")) {
      reject(new Error("BAD_REQUEST"));
      return;
    }

    const parser = Busboy({
      headers: request.headers,
      limits: { fileSize: MAX_FILE_BYTES, files: MAX_WORKBOOKS, fields: 10 }
    });
    const files: UploadedWorkbook[] = [];
    let totalBytes = 0;
    let academicYear = "";
    let mappingVersion = STUDENT_XLSX_MAPPING_VERSION;
    let sourceType = "approved_student_xlsx";
    let fileTooLarge = false;
    let totalTooLarge = false;
    let tooManyFiles = false;
    let unexpectedFileField = false;

    parser.on("file", (fieldName, file, info) => {
      if (fieldName !== "file") unexpectedFileField = true;
      const chunks: Buffer[] = [];
      file.on("data", (chunk: Buffer) => {
        totalBytes += chunk.length;
        if (totalBytes > MAX_TOTAL_BYTES) {
          totalTooLarge = true;
          return;
        }
        chunks.push(chunk);
      });
      file.on("limit", () => { fileTooLarge = true; });
      file.on("end", () => { files.push({ bytes: Buffer.concat(chunks), filename: info.filename }); });
    });
    parser.on("filesLimit", () => { tooManyFiles = true; });
    parser.on("field", (field, value) => {
      if (field === "academicYear") academicYear = value;
      if (field === "mappingVersion") mappingVersion = value;
      if (field === "sourceType") sourceType = value;
    });
    parser.on("error", reject);
    request.on("error", reject);
    parser.on("finish", () => {
      if (fileTooLarge || totalTooLarge) { reject(new Error("FILE_TOO_LARGE")); return; }
      if (tooManyFiles) { reject(new Error("TOO_MANY_FILES")); return; }
      if (unexpectedFileField) { reject(new Error("UNEXPECTED_FILE_FIELD")); return; }
      if (files.length === 0 || files.some((file) => !file.filename.toLowerCase().endsWith(".xlsx"))) {
        reject(new Error("BAD_REQUEST"));
        return;
      }
      resolve({ files, academicYear, mappingVersion, sourceType });
    });
    request.pipe(parser);
  });
}

export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  if (!method(request, response, ["POST"])) return;
  const startedAt = Date.now();
  let actor;
  try { actor = await authenticatedActor(bearerToken(request.headers)); } catch {
    problem(response, 503, "AUTH_UNAVAILABLE", "Server authentication is not configured");
    return;
  }
  if (!actor) { problem(response, 401, "UNAUTHORIZED", "Importer authentication is required"); return; }
  if (!["importer", "owner"].includes(actor.role)) { problem(response, 403, "FORBIDDEN", "Importer role is required"); return; }

  let upload: Upload;
  try { upload = await parseMultipart(request); } catch (error) {
    const code = error instanceof Error ? error.message : "BAD_REQUEST";
    const status = code === "FILE_TOO_LARGE" ? 413 : 400;
    await recordTelemetry({ eventName: "request_failed", severity: "warning", route: "/api/admin/imports", statusCode: status, durationMs: Date.now() - startedAt, errorCode: code });
    problem(response, status, "BAD_REQUEST", uploadErrorMessage[code] ?? uploadErrorMessage.BAD_REQUEST);
    return;
  }

  if (upload.sourceType !== "approved_student_xlsx" || !/^\d{4}$/u.test(upload.academicYear) || upload.mappingVersion !== schema.schemaVersion) {
    problem(response, 400, "BAD_REQUEST", "The source type, academic year, or mapping version is invalid.");
    return;
  }
  const setError = validateSchoolWorkbookSet(upload.files, upload.academicYear);
  if (setError) { problem(response, 400, "BAD_REQUEST", uploadErrorMessage[setError] ?? uploadErrorMessage.BAD_REQUEST); return; }

  const client = supabaseAdmin();
  const jobId = randomUUID();
  const storedPaths: string[] = [];
  let jobCreated = false;
  let stage = "workbook_read";
  try {
    const { readWorkbook } = await import("../../apps/directory-worker/src/import/xlsxReader.js");
    const { validateWorkbook } = await import("../../apps/directory-worker/src/import/validateWorkbook.js");
    const files: PreparedWorkbook[] = [];

    for (const uploaded of [...upload.files].sort((a, b) => a.filename.localeCompare(b.filename, undefined, { numeric: true }))) {
      const id = randomUUID();
      const checksum = createHash("sha256").update(uploaded.bytes).digest("hex");
      const storagePath = `raw-xlsx/${upload.academicYear}/${jobId}/${id}.xlsx`;
      const workbook = await readWorkbook({ filename: uploaded.filename, bytes: uploaded.bytes, sourceType: "approved_student_xlsx" });
      files.push({ ...uploaded, id, checksum, storagePath, workbook });
    }

    stage = "workbook_validation";
    const perFile = files.map((file) => ({
      fileName: file.filename,
      result: validateWorkbook(
        { workbook: file.workbook, fileName: file.filename, academicYear: upload.academicYear, sourceType: "approved_student_xlsx" },
        { ...schema, expectedAcademicYear: upload.academicYear }
      )
    }));
    const validated = aggregateWorkbookValidations(perFile);
    const errorRows = new Set(validated.issues
      .filter((issue) => issue.severity === "error" && issue.rowNumber !== undefined)
      .map((issue) => `${issue.fileName}:${issue.sheetName ?? ""}:${issue.rowNumber}`));
    const rejectedRowCount = errorRows.size || validated.issues.filter((issue) => issue.severity === "error").length;
    const totalBytes = files.reduce((sum, file) => sum + file.bytes.byteLength, 0);
    const totalSheetCount = files.reduce((sum, file) => sum + file.workbook.sheets.length, 0);
    const totalRowCount = files.reduce((sum, file) => sum + file.workbook.sheets.reduce((subtotal, sheet) => subtotal + sheet.rows.length, 0), 0);

    stage = "storage_upload";
    for (const file of files) {
      const storage = await client.storage.from("directory-raw").upload(file.storagePath, file.bytes, { contentType: XLSX_MIME, cacheControl: "0", upsert: false });
      if (storage.error) throw new Error("STORAGE_ERROR");
      storedPaths.push(file.storagePath);
    }

    stage = "import_job_insert";
    const { error: jobError } = await client.schema("directory").from("import_jobs").insert({
      id: jobId,
      status: "validating",
      source_type: upload.sourceType,
      academic_year: upload.academicYear,
      parser_version: "exceljs-4.4.0",
      mapping_version: upload.mappingVersion,
      uploader_id: actor.id
    });
    if (jobError) throw new Error("DATABASE_ERROR");
    jobCreated = true;

    stage = "source_file_insert";
    const sourceFileRows = files.map((file) => ({
      id: file.id,
      job_id: jobId,
      file_name: file.filename,
      content_type: XLSX_MIME,
      byte_size: file.bytes.byteLength,
      checksum_sha256: file.checksum,
      storage_path: file.storagePath,
      academic_year: upload.academicYear,
      source_type: upload.sourceType,
      uploaded_by: actor.id
    }));
    const { error: sourceError } = await client.schema("directory").from("source_files").insert(sourceFileRows);
    if (sourceError) throw new Error("DATABASE_ERROR");

    stage = "issue_insert";
    if (validated.issues.length > 0) {
      const idByFilename = new Map(files.map((file) => [file.filename, file.id]));
      const issueRows = validated.issues.map((issue) => ({
        job_id: jobId,
        severity: issue.severity,
        code: issue.code,
        file_id: idByFilename.get(issue.fileName),
        file_name: issue.fileName,
        ...(issue.sheetName ? { sheet_name: issue.sheetName } : {}),
        ...(issue.rowNumber ? { row_number: issue.rowNumber } : {}),
        safe_message: issue.message
      }));
      const { error: issueError } = await client.schema("directory").from("import_issues").insert(issueRows);
      if (issueError) throw new Error("DATABASE_ERROR");
    }

    const status = validated.blocking ? "rejected" : "ready_for_review";
    stage = "import_job_update";
    const { data: job, error: updateError } = await client.schema("directory").from("import_jobs").update({
      status,
      accepted_row_count: validated.students.length,
      rejected_row_count: rejectedRowCount,
      warning_row_count: validated.issues.filter((issue) => issue.severity === "warning").length,
      blocking: validated.blocking,
      updated_at: new Date().toISOString()
    }).eq("id", jobId).select("id,status,source_type,academic_year,parser_version,mapping_version,accepted_row_count,rejected_row_count,warning_row_count,blocking,created_at,updated_at").single();
    if (updateError || !job) throw new Error("DATABASE_ERROR");

    stage = "audit_event";
    await client.schema("directory").from("audit_events").insert({
      event: "upload",
      actor_id: actor.id,
      actor_role: actor.role,
      job_id: jobId,
      outcome: "success",
      safe_metadata: { byteSize: totalBytes, fileCount: files.length, sheetCount: totalSheetCount, rowCount: totalRowCount }
    });
    await recordTelemetry({ eventName: "request_completed", severity: "info", route: "/api/admin/imports", statusCode: 201, durationMs: Date.now() - startedAt, safeMetadata: { byteSize: totalBytes, fileCount: files.length, studentCount: validated.students.length } });

    const sourceFiles = files.map((file) => ({ id: file.id, fileName: file.filename, byteSize: file.bytes.byteLength, academicYear: upload.academicYear, sourceType: upload.sourceType, checksumSha256: file.checksum }));
    json(response, 201, {
      job: clientImportJob(job),
      sourceFiles,
      sourceFile: { fileName: sourceFiles.map((file) => file.fileName).join(", ") },
      fileCount: files.length,
      totalByteSize: totalBytes,
      sheetCount: totalSheetCount,
      rowCount: totalRowCount
    });
  } catch (error) {
    if (storedPaths.length > 0) {
      try { await client.storage.from("directory-raw").remove(storedPaths); } catch { /* best-effort compensation */ }
    }
    if (jobCreated) {
      try { await client.schema("directory").from("import_jobs").update({ status: "rejected", blocking: true, updated_at: new Date().toISOString() }).eq("id", jobId); } catch { /* best-effort compensation */ }
    }
    const code = error instanceof Error ? error.message : "INTERNAL_ERROR";
    await recordTelemetry({ eventName: "request_failed", severity: "error", route: "/api/admin/imports", statusCode: code === "STORAGE_ERROR" ? 503 : code === "WORKBOOK_INVALID" ? 400 : 500, durationMs: Date.now() - startedAt, errorCode: code === "WORKBOOK_INVALID" ? "WORKBOOK_INVALID" : "IMPORT_FAILED" });
    const publicDetail = code === "STORAGE_ERROR"
      ? "Private XLSX storage is unavailable."
      : code === "WORKBOOK_INVALID"
        ? "One or more approved XLSX workbooks could not be read."
        : `Import failed during ${stage}.`;
    problem(response, code === "STORAGE_ERROR" ? 503 : code === "WORKBOOK_INVALID" ? 400 : 500, code === "WORKBOOK_INVALID" ? "BAD_REQUEST" : "INTERNAL_ERROR", publicDetail);
  }
}
