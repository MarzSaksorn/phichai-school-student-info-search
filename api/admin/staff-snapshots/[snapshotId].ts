import type { ApiRequest, ApiResponse } from "../../_lib/http.js";
import { bearerToken, json, method, problem } from "../../_lib/http.js";
import { authenticatedActor, supabaseAdmin } from "../../_lib/supabase.js";

export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  if (!method(request, response, ["GET"])) return;
  const actor = await authenticatedActor(bearerToken(request.headers));
  if (!actor) { problem(response, 401, "UNAUTHORIZED", "Administrator authentication is required"); return; }
  if (!["importer", "publisher", "operator", "owner"].includes(actor.role)) { problem(response, 403, "FORBIDDEN", "Administrator role is insufficient"); return; }
  const snapshotId = Array.isArray(request.query?.snapshotId) ? request.query.snapshotId[0] : request.query?.snapshotId;
  if (!snapshotId) { problem(response, 400, "BAD_REQUEST", "Staff snapshot id is required"); return; }

  const client = supabaseAdmin();
  const { data: snapshot, error: snapshotError } = await client.schema("directory").from("staff_snapshot_jobs")
    .select("id,status,source_type,source_url,captured_at,parser_version,schema_version,checksum_sha256,byte_size,accepted_count,rejected_count,warning_count,blocking,uploader_id,reviewer_id,reviewed_at,created_at,updated_at")
    .eq("id", snapshotId).maybeSingle();
  if (snapshotError) { problem(response, 500, "INTERNAL_ERROR"); return; }
  if (!snapshot) { problem(response, 404, "NOT_FOUND", "Staff snapshot was not found"); return; }
  const [{ data: issues, error: issueError }, { data: records, error: recordError }] = await Promise.all([
    client.schema("directory").from("staff_snapshot_issues").select("id,severity,code,ordinal,safe_message,created_at").eq("snapshot_id", snapshotId).order("created_at", { ascending: true }).limit(500),
    client.schema("directory").from("staff_snapshot_records").select("ordinal,public_id,display_name,search_name,category,title,source_row").eq("snapshot_id", snapshotId).order("ordinal", { ascending: true }).limit(500)
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
      publishable: false
    },
    issues: issues ?? [],
    records: records ?? []
  });
}
