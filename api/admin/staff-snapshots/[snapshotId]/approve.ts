import type { ApiRequest, ApiResponse } from "../../../_lib/http.js";
import { bearerToken, json, method, problem } from "../../../_lib/http.js";
import { authenticatedActor, supabaseAdmin } from "../../../_lib/supabase.js";

export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  if (!method(request, response, ["POST"])) return;
  if (process.env.STAFF_SNAPSHOT_APPROVAL_ENABLED === "false") {
    problem(response, 403, "FORBIDDEN", "Staff snapshot publication is disabled by configuration.");
    return;
  }
  let actor;
  try { actor = await authenticatedActor(bearerToken(request.headers)); } catch {
    problem(response, 503, "AUTH_UNAVAILABLE", "Server authentication is not configured");
    return;
  }
  if (!actor) { problem(response, 401, "UNAUTHORIZED", "Publisher authentication is required"); return; }
  if (!["publisher", "owner"].includes(actor.role)) { problem(response, 403, "FORBIDDEN", "Publisher role is required"); return; }
  const snapshotId = Array.isArray(request.query?.snapshotId) ? request.query?.snapshotId[0] : request.query?.snapshotId;
  if (!snapshotId) { problem(response, 400, "BAD_REQUEST", "Staff snapshot id is required"); return; }

  try {
    const client = supabaseAdmin();
    const { data, error } = await client.schema("directory").rpc("publish_staff_snapshot", {
      p_snapshot_id: snapshotId,
      p_actor_id: actor.id,
      p_actor_role: actor.role
    });
    if (error || !data || data.length === 0) {
      const message = error?.message ?? "Staff snapshot publication returned no result";
      if (/NOT_FOUND|not found/i.test(message)) { problem(response, 404, "NOT_FOUND", "Staff snapshot was not found"); return; }
      if (/NOT_READY|POLICY_FAILED|COUNT_MISMATCH|ready|blocking/i.test(message)) {
        problem(response, 409, "BAD_REQUEST", "Staff snapshot is not ready for public publication.");
        return;
      }
      problem(response, 500, "INTERNAL_ERROR", "Staff snapshot could not be published.");
      return;
    }
    const publication = Array.isArray(data) ? data[0] : data;
    json(response, 200, {
      snapshot: {
        id: publication.snapshot_id,
        status: "approved",
        acceptedCount: publication.record_count,
        publishedAt: publication.published_at,
        publishable: true,
        publicFields: ["displayName", "category", "title", "department"]
      },
      note: "The reviewed staff snapshot is now visible in the public directory."
    });
  } catch {
    problem(response, 500, "INTERNAL_ERROR", "Staff snapshot could not be published.");
  }
}
