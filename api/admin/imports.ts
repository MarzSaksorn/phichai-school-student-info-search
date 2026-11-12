import { randomUUID, createHash } from "node:crypto";
import Busboy from "busboy";
import type { IncomingMessage } from "node:http";
import type { ImportSchemaConfig } from "../../apps/directory-worker/src/import/schemaRules.js";
import type { ApiRequest, ApiResponse } from "../_lib/http.js";
import { bearerToken, json, method, problem } from "../_lib/http.js";
import { clientImportJob } from "../_lib/adminView.js";
import { authenticatedActor, supabaseAdmin } from "../_lib/supabase.js";
import { STUDENT_XLSX_MAPPING_VERSION, studentXlsxSchema } from "../_lib/studentSchema.js";
import { recordTelemetry } from "../_lib/telemetry.js";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const MAX_BYTES = 10 * 1024 * 1024;
const schema: ImportSchemaConfig = studentXlsxSchema;

type Upload = { bytes: Buffer; filename: string; academicYear: string; mappingVersion: string; sourceType: string };
function parseMultipart(request: IncomingMessage): Promise<Upload> {
  return new Promise((resolve, reject) => {
    const contentType = request.headers["content-type"];
    if (typeof contentType !== "string" || !contentType.startsWith("multipart/form-data")) { reject(new Error("BAD_REQUEST")); return; }
    const parser = Busboy({ headers: request.headers, limits: { fileSize: MAX_BYTES, files: 1, fields: 10 } });
  const chunks: Buffer[] = []; let filename = ""; let academicYear = ""; let mappingVersion = STUDENT_XLSX_MAPPING_VERSION; let sourceType = "approved_student_xlsx"; let fileTooLarge = false;
    parser.on("file", (_field, file, info) => { filename = info.filename; file.on("data", (chunk: Buffer) => chunks.push(chunk)); file.on("limit", () => { fileTooLarge = true; }); });
    parser.on("field", (field, value) => { if (field === "academicYear") academicYear = value; if (field === "mappingVersion") mappingVersion = value; if (field === "sourceType") sourceType = value; });
    parser.on("error", reject);
    parser.on("finish", () => { if (fileTooLarge) { reject(new Error("FILE_TOO_LARGE")); return; } if (!filename || !filename.toLowerCase().endsWith(".xlsx")) { reject(new Error("WORKBOOK_INVALID")); return; } resolve({ bytes: Buffer.concat(chunks), filename, academicYear, mappingVersion, sourceType }); });
    request.pipe(parser);
  });
}

export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  if (!method(request, response, ["POST"])) return;
  const startedAt = Date.now();
  const actor = await authenticatedActor(bearerToken(request.headers));
  if (!actor) { problem(response, 401, "UNAUTHORIZED", "Importer authentication is required"); return; }
  if (!["importer", "owner"].includes(actor.role)) { problem(response, 403, "FORBIDDEN", "Importer role is required"); return; }
  let upload: Upload;
  try { upload = await parseMultipart(request); } catch (error) { const code = error instanceof Error ? error.message : "BAD_REQUEST"; const status = code === "FILE_TOO_LARGE" ? 413 : 400; await recordTelemetry({ eventName: "request_failed", severity: "warning", route: "/api/admin/imports", statusCode: status, durationMs: Date.now() - startedAt, errorCode: code }); problem(response, status, "BAD_REQUEST", code === "FILE_TOO_LARGE" ? "The XLSX file exceeds the 10 MiB limit" : "A valid XLSX multipart upload is required"); return; }
  if (upload.sourceType !== "approved_student_xlsx" || !/^\d{4}$/.test(upload.academicYear) || upload.mappingVersion !== schema.schemaVersion) { problem(response, 400, "BAD_REQUEST", "The source type, academic year, or mapping version is invalid"); return; }
  const client = supabaseAdmin(); const jobId = randomUUID(); const sourceFileId = randomUUID(); const checksum = createHash("sha256").update(upload.bytes).digest("hex"); const storagePath = `raw-xlsx/${upload.academicYear}/${jobId}/${sourceFileId}.xlsx`;
  try {
    const { readWorkbook } = await import("../../apps/directory-worker/src/import/xlsxReader.js");
    const { validateWorkbook } = await import("../../apps/directory-worker/src/import/validateWorkbook.js");
    const workbook = await readWorkbook({ filename: upload.filename, bytes: upload.bytes, sourceType: "approved_student_xlsx" });
    const storage = await client.storage.from("directory-raw").upload(storagePath, upload.bytes, { contentType: XLSX_MIME, cacheControl: "0", upsert: false });
    if (storage.error) throw new Error("STORAGE_ERROR");
    const { error: jobError } = await client.schema("directory").from("import_jobs").insert({ id: jobId, status: "validating", source_type: upload.sourceType, academic_year: upload.academicYear, parser_version: "exceljs-4.4.0", mapping_version: upload.mappingVersion, uploader_id: actor.id, source_file_ids: [sourceFileId] });
    if (jobError) throw new Error("DATABASE_ERROR");
    const { error: sourceError } = await client.schema("directory").from("source_files").insert({ id: sourceFileId, job_id: jobId, file_name: upload.filename, content_type: XLSX_MIME, byte_size: upload.bytes.byteLength, checksum_sha256: checksum, storage_path: storagePath, academic_year: upload.academicYear, source_type: upload.sourceType, uploaded_by: actor.id });
    if (sourceError) throw new Error("DATABASE_ERROR");
    const validated = validateWorkbook({ workbook, fileName: upload.filename, academicYear: upload.academicYear, sourceType: "approved_student_xlsx" }, { ...schema, expectedAcademicYear: upload.academicYear });
    const errorRows = new Set(validated.issues.filter((issue) => issue.severity === "error" && issue.rowNumber !== undefined).map((issue) => `${issue.sheetName ?? ""}:${issue.rowNumber}`));
    const rejectedRowCount = errorRows.size || validated.issues.filter((issue) => issue.severity === "error").length;
    for (const issue of validated.issues) await client.schema("directory").from("import_issues").insert({ job_id: jobId, severity: issue.severity, code: issue.code, file_id: sourceFileId, file_name: issue.fileName, ...(issue.sheetName ? { sheet_name: issue.sheetName } : {}), ...(issue.rowNumber ? { row_number: issue.rowNumber } : {}), safe_message: issue.message });
    const status = validated.blocking ? "rejected" : "ready_for_review";
    const { data: job, error: updateError } = await client.schema("directory").from("import_jobs").update({ status, accepted_row_count: validated.students.length, rejected_row_count: rejectedRowCount, warning_row_count: validated.issues.filter((issue) => issue.severity === "warning").length, blocking: validated.blocking, updated_at: new Date().toISOString() }).eq("id", jobId).select("id,status,source_type,academic_year,parser_version,mapping_version,accepted_row_count,rejected_row_count,warning_row_count,blocking,created_at,updated_at").single();
    if (updateError || !job) throw new Error("DATABASE_ERROR");
    await client.schema("directory").from("audit_events").insert({ event: "upload", actor_id: actor.id, actor_role: actor.role, job_id: jobId, outcome: "success", safe_metadata: { byteSize: upload.bytes.byteLength, sheetCount: workbook.sheets.length } });
    await recordTelemetry({ eventName: "request_completed", severity: "info", route: "/api/admin/imports", statusCode: 201, durationMs: Date.now() - startedAt, safeMetadata: { byteSize: upload.bytes.byteLength, rowCount: workbook.sheets.reduce((total, sheet) => total + sheet.rows.length, 0) } });
    json(response, 201, { job: clientImportJob(job), sourceFile: { id: sourceFileId, fileName: upload.filename, byteSize: upload.bytes.byteLength, academicYear: upload.academicYear, sourceType: upload.sourceType, checksumSha256: checksum }, fileId: sourceFileId, checksum, sheetNames: workbook.sheets.map((sheet) => sheet.name), rowCount: workbook.sheets.reduce((total, sheet) => total + sheet.rows.length, 0) });
  } catch (error) {
    try { await client.storage.from("directory-raw").remove([storagePath]); } catch { /* best-effort compensation */ }
    try { await client.schema("directory").from("import_jobs").update({ status: "rejected", blocking: true, updated_at: new Date().toISOString() }).eq("id", jobId); } catch { /* best-effort compensation */ }
    const code = error instanceof Error ? error.message : "INTERNAL_ERROR";
    await recordTelemetry({ eventName: "request_failed", severity: "error", route: "/api/admin/imports", statusCode: code === "STORAGE_ERROR" ? 503 : 500, durationMs: Date.now() - startedAt, errorCode: code === "WORKBOOK_INVALID" ? "WORKBOOK_INVALID" : "IMPORT_FAILED" });
    problem(response, code === "STORAGE_ERROR" ? 503 : 500, code === "WORKBOOK_INVALID" ? "BAD_REQUEST" : "INTERNAL_ERROR");
  }
}
