import type { ApiRequest, ApiResponse } from "../../../_lib/http.js";
import { bearerToken, json, method, problem } from "../../../_lib/http.js";
import { authenticatedActor, supabaseAdmin } from "../../../_lib/supabase.js";

export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  if (!method(request, response, ["POST"])) return;
  if (process.env.STAFF_SNAPSHOT_APPROVAL_ENABLED !== "true") {
    problem(response, 403, "FORBIDDEN", "Staff snapshot approval is disabled until the public staff policy is approved.");
    return;
  }
  const actor = await authenticatedActor(bearerToken(request.headers));
  if (!actor) { problem(response, 401, "UNAUTHORIZED", "Publisher authentication is required"); return; }
  if (!["publisher", "owner"].includes(actor.role)) { problem(response, 403, "FORBIDDEN", "Publisher role is required"); return; }
  const snapshotId = Array.isArray(request.query?.snapshotId) ? request.query?.snapshotId[0] : request.query?.snapshotId;
  if (!snapshotId) { problem(response, 400, "BAD_REQUEST", "Staff snapshot id is required"); return; }

  const client = supabaseAdmin();
  const { data: snapshot, error: loadError } = await client.schema("directory").from("staff_snapshot_jobs")
    .select("id,status,blocking,accepted_count,rejected_count,warning_count")
    .eq("id", snapshotId).maybeSingle();
  if (loadError) { problem(response, 500, "INTERNAL_ERROR"); return; }
  if (!snapshot) { problem(response, 404, "NOT_FOUND", "Staff snapshot was not found"); return; }
  if (snapshot.status === "approved") {
    json(response, 200, { snapshot: { id: snapshot.id, status: "approved", publishable: false }, idempotent: true });
    return;
  }
  if (snapshot.status !== "ready_for_review" || snapshot.blocking) {
    problem(response, 409, "BAD_REQUEST", "Staff snapshot is not ready for publisher approval");
    return;
  }

  const { data: updated, error: updateError } = await client.schema("directory").from("staff_snapshot_jobs")
    .update({ status: "approved", reviewer_id: actor.id, reviewed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", snapshotId).eq("status", "ready_for_review").eq("blocking", false)
    .select("id,status,accepted_count,rejected_count,warning_count,reviewer_id,reviewed_at").single();
  if (updateError || !updated) { problem(response, 409, "BAD_REQUEST", "Staff snapshot could not be approved; reload the review and try again."); return; }

  const { error: auditError } = await client.schema("directory").from("audit_events").insert({
    event: "staff_snapshot_approved",
    actor_id: actor.id,
    actor_role: actor.role,
    outcome: "success",
    safe_metadata: { snapshotId, acceptedCount: updated.accepted_count, warningCount: updated.warning_count }
  });
  if (auditError) { problem(response, 500, "INTERNAL_ERROR"); return; }

  json(response, 200, {
    snapshot: {
      id: updated.id,
      status: updated.status,
      acceptedCount: updated.accepted_count,
      rejectedCount: updated.rejected_count,
      warningCount: updated.warning_count,
      reviewerId: updated.reviewer_id,
      reviewedAt: updated.reviewed_at,
      publishable: false
    },
    note: "The snapshot is approved for the next staff publication implementation but is not public."
  });
}
