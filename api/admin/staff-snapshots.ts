import { createHash, randomUUID } from "node:crypto";
import Busboy from "busboy";
import type { IncomingMessage } from "node:http";
import { STAFF_SNAPSHOT_SCHEMA_VERSION, STAFF_SNAPSHOT_SOURCE_TYPE, STAFF_SNAPSHOT_URL, parseStaffSnapshot } from "../../apps/directory-worker/src/import/staffSnapshot.js";
import type { ApiRequest, ApiResponse } from "../_lib/http.js";
import { bearerToken, json, method, problem } from "../_lib/http.js";
import { authenticatedActor, supabaseAdmin } from "../_lib/supabase.js";

const MAX_SNAPSHOT_BYTES = 8 * 1024 * 1024;
const HTML_MIME = "text/html";

type SnapshotUpload = {
  bytes: Buffer;
  filename: string;
  sourceUrl: string;
  capturedAt: string;
};

function parseMultipart(request: IncomingMessage): Promise<SnapshotUpload> {
  return new Promise((resolve, reject) => {
    const contentType = request.headers["content-type"];
    if (typeof contentType !== "string" || !contentType.startsWith("multipart/form-data")) {
      reject(new Error("BAD_REQUEST"));
      return;
    }
    const parser = Busboy({ headers: request.headers, limits: { fileSize: MAX_SNAPSHOT_BYTES, files: 1, fields: 4 } });
    const chunks: Buffer[] = [];
    let filename = "";
    let sourceUrl = "";
    let capturedAt = "";
    let fileTooLarge = false;
    let unexpectedFile = false;
    let fileCount = 0;

    parser.on("file", (fieldName, file, info) => {
      fileCount += 1;
      if (fieldName !== "snapshot") unexpectedFile = true;
      filename = info.filename;
      file.on("data", (chunk: Buffer) => chunks.push(chunk));
      file.on("limit", () => { fileTooLarge = true; });
    });
    parser.on("field", (field, value) => {
      if (field === "sourceUrl") sourceUrl = value;
      if (field === "capturedAt") capturedAt = value;
    });
    parser.on("filesLimit", () => { unexpectedFile = true; });
    parser.on("error", reject);
    request.on("error", reject);
    parser.on("finish", () => {
      if (fileTooLarge) { reject(new Error("FILE_TOO_LARGE")); return; }
      if (unexpectedFile || fileCount !== 1 || !filename.toLowerCase().endsWith(".html")) { reject(new Error("BAD_REQUEST")); return; }
      resolve({ bytes: Buffer.concat(chunks), filename, sourceUrl, capturedAt });
    });
    request.pipe(parser);
  });
}

export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  if (!method(request, response, ["POST"])) return;
  if (process.env.STAFF_SNAPSHOT_IMPORT_ENABLED !== "true") {
    problem(response, 403, "FORBIDDEN", "Staff snapshot import is disabled until the school source policy is approved.");
    return;
  }
  let actor;
  try { actor = await authenticatedActor(bearerToken(request.headers)); } catch {
    problem(response, 503, "AUTH_UNAVAILABLE", "Server authentication is not configured");
    return;
  }
  if (!actor) { problem(response, 401, "UNAUTHORIZED", "Importer authentication is required"); return; }
  if (!["importer", "owner"].includes(actor.role)) { problem(response, 403, "FORBIDDEN", "Importer role is required"); return; }

  let upload: SnapshotUpload;
  try { upload = await parseMultipart(request); } catch (error) {
    const code = error instanceof Error ? error.message : "BAD_REQUEST";
    problem(response, code === "FILE_TOO_LARGE" ? 413 : 400, "BAD_REQUEST", code === "FILE_TOO_LARGE" ? "The HTML snapshot must be at most 8 MiB." : "A single HTML staff snapshot is required.");
    return;
  }
  if (upload.sourceUrl !== STAFF_SNAPSHOT_URL) { problem(response, 400, "BAD_REQUEST", "The snapshot source URL is not approved."); return; }
  if (Number.isNaN(Date.parse(upload.capturedAt))) { problem(response, 400, "BAD_REQUEST", "A valid ISO capture time is required."); return; }

  const snapshotId = randomUUID();
  const checksum = createHash("sha256").update(upload.bytes).digest("hex");
  const storagePath = `staff-snapshots/${snapshotId}/${snapshotId}.html`;
  let stored = false;
  const client = supabaseAdmin();
  try {
    const review = parseStaffSnapshot(upload.bytes.toString("utf8"), {
      snapshotId,
      sourceUrl: upload.sourceUrl,
      capturedAt: upload.capturedAt,
      fileName: upload.filename,
      schemaVersion: STAFF_SNAPSHOT_SCHEMA_VERSION
    });
    const storage = await client.storage.from("directory-raw").upload(storagePath, upload.bytes, { contentType: HTML_MIME, cacheControl: "0", upsert: false });
    if (storage.error) throw new Error("STORAGE_ERROR");
    stored = true;

    const { error: jobError } = await client.schema("directory").from("staff_snapshot_jobs").insert({
      id: snapshotId,
      status: review.readyForReview ? "ready_for_review" : "rejected",
      source_type: STAFF_SNAPSHOT_SOURCE_TYPE,
      source_url: upload.sourceUrl,
      captured_at: upload.capturedAt,
      parser_version: "staff-html-tokenizer-v1",
      schema_version: review.schemaVersion,
      storage_path: storagePath,
      checksum_sha256: checksum,
      byte_size: upload.bytes.byteLength,
      accepted_count: review.acceptedCount,
      rejected_count: review.rejectedCount,
      warning_count: review.issues.filter((issue) => issue.severity === "warning").length,
      blocking: !review.readyForReview,
      uploader_id: actor.id
    });
    if (jobError) throw new Error("DATABASE_ERROR");

    if (review.records.length > 0) {
      const { error: recordError } = await client.schema("directory").from("staff_snapshot_records").insert(review.records.map((record) => ({
        snapshot_id: snapshotId,
        ordinal: record.sourceRow,
        public_id: record.publicId,
        display_name: record.displayName,
        search_name: record.searchName,
        category: record.category,
        ...(record.title ? { title: record.title } : {}),
        source_row: record.sourceRow
      })));
      if (recordError) throw new Error("DATABASE_ERROR");
    }
    if (review.issues.length > 0) {
      const { error: issueError } = await client.schema("directory").from("staff_snapshot_issues").insert(review.issues.map((issue) => ({
        snapshot_id: snapshotId,
        severity: issue.severity,
        code: issue.code,
        ...(issue.ordinal ? { ordinal: issue.ordinal } : {}),
        safe_message: issue.message
      })));
      if (issueError) throw new Error("DATABASE_ERROR");
    }

    json(response, 201, {
      snapshot: {
        id: snapshotId,
        status: review.readyForReview ? "ready_for_review" : "rejected",
        sourceType: STAFF_SNAPSHOT_SOURCE_TYPE,
        sourceUrl: upload.sourceUrl,
        capturedAt: upload.capturedAt,
        schemaVersion: review.schemaVersion,
        acceptedCount: review.acceptedCount,
        rejectedCount: review.rejectedCount,
        warningCount: review.issues.filter((issue) => issue.severity === "warning").length,
        blocking: !review.readyForReview,
        publishable: false
      }
    });
  } catch (error) {
    if (stored) {
      try { await client.storage.from("directory-raw").remove([storagePath]); } catch { /* best-effort compensation */ }
    }
    const code = error instanceof Error ? error.message : "INTERNAL_ERROR";
    problem(response, code === "STORAGE_ERROR" ? 503 : 500, code === "STORAGE_ERROR" ? "INTERNAL_ERROR" : "INTERNAL_ERROR", code === "STORAGE_ERROR" ? "Private snapshot storage is unavailable." : "Staff snapshot review could not be recorded.");
  }
}
