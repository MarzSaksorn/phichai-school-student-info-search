import type { ApiRequest, ApiResponse } from "../../_lib/http.js";
import { bearerToken, json, method, problem } from "../../_lib/http.js";
import { authenticatedActor, supabaseAdmin } from "../../_lib/supabase.js";

const STAFF_SNAPSHOT_EMAIL_SCHEMA_VERSION = "staff-web-card-v3";
const STAFF_REVIEW_PAGE_SIZE = 500;
const STAFF_REVIEW_MAX_OFFSET = 1_000_000;

export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  if (!method(request, response, ["GET"])) return;
  const actor = await authenticatedActor(bearerToken(request.headers));
  if (!actor) { problem(response, 401, "UNAUTHORIZED", "Administrator authentication is required"); return; }
  if (!["importer", "publisher", "operator", "owner"].includes(actor.role)) { problem(response, 403, "FORBIDDEN", "Administrator role is insufficient"); return; }
  const snapshotId = Array.isArray(request.query?.snapshotId) ? request.query.snapshotId[0] : request.query?.snapshotId;
  if (!snapshotId) { problem(response, 400, "BAD_REQUEST", "Staff snapshot id is required"); return; }
  const rawOffset = Array.isArray(request.query?.offset) ? request.query.offset[0] : request.query?.offset;
  if (rawOffset !== undefined && !/^(?:0|[1-9]\d*)$/u.test(rawOffset)) { problem(response, 400, "BAD_REQUEST", "Review offset must be a non-negative integer"); return; }
  const offset = rawOffset === undefined ? 0 : Number(rawOffset);
  if (!Number.isSafeInteger(offset) || offset > STAFF_REVIEW_MAX_OFFSET) { problem(response, 400, "BAD_REQUEST", "Review offset is out of range"); return; }

  const client = supabaseAdmin();
  const { data: snapshot, error: snapshotError } = await client.schema("directory").from("staff_snapshot_jobs")
    .select("id,status,source_type,source_url,captured_at,parser_version,schema_version,checksum_sha256,byte_size,accepted_count,rejected_count,warning_count,blocking,uploader_id,reviewer_id,reviewed_at,created_at,updated_at")
    .eq("id", snapshotId).maybeSingle();
  if (snapshotError) { problem(response, 500, "INTERNAL_ERROR"); return; }
  if (!snapshot) { problem(response, 404, "NOT_FOUND", "Staff snapshot was not found"); return; }
  const [{ data: issues, error: issueError, count: issueCount }, { data: records, error: recordError, count: recordCount }] = await Promise.all([
    client.schema("directory").from("staff_snapshot_issues").select("id,severity,code,ordinal,safe_message,created_at", { count: "exact" }).eq("snapshot_id", snapshotId).order("created_at", { ascending: true }).order("id", { ascending: true }).range(offset, offset + STAFF_REVIEW_PAGE_SIZE - 1),
    client.schema("directory").from("staff_snapshot_records").select("ordinal,public_id,display_name,search_name,category,department,email,title,source_row", { count: "exact" }).eq("snapshot_id", snapshotId).order("ordinal", { ascending: true }).range(offset, offset + STAFF_REVIEW_PAGE_SIZE - 1)
  ]);
  if (issueError || recordError) { problem(response, 500, "INTERNAL_ERROR"); return; }

  json(response, 200, {
    snapshot: {
      id: snapshot.id,
      status: snapshot.status,
      sourceType: snapshot.source_type,
      sourceUrl: snapshot.source_url,
      capturedAt: snapshot.captured_at,
      parserVersion: snapshot.parser_version,
      schemaVersion: snapshot.schema_version,
      checksumSha256: snapshot.checksum_sha256,
      byteSize: snapshot.byte_size,
      acceptedCount: snapshot.accepted_count,
      rejectedCount: snapshot.rejected_count,
      warningCount: snapshot.warning_count,
      blocking: snapshot.blocking,
      reviewerId: snapshot.reviewer_id,
      reviewedAt: snapshot.reviewed_at,
      createdAt: snapshot.created_at,
      updatedAt: snapshot.updated_at,
      publishable: snapshot.status === "approved",
      publicFields: snapshot.status === "approved" ? ["displayName", "category", "title", "department", ...(snapshot.schema_version === STAFF_SNAPSHOT_EMAIL_SCHEMA_VERSION ? ["email"] : [])] : []
    },
    recordCount: recordCount ?? 0,
    issueCount: issueCount ?? 0,
    issues: issues ?? [],
    records: records ?? []
  });
}
