import type { DirectoryStore } from "../../../../../../directory-worker/src/db/client.js";
import { getActiveDatasetVersion } from "../../../../../../directory-worker/src/repositories/datasetVersions.js";

export function createDirectoryMetaRoute(store: DirectoryStore) {
  return async function GET(): Promise<Response> {
    const active = await getActiveDatasetVersion(store);
    if (!active) return Response.json({ error: "NO_ACTIVE_DATASET" }, { status: 503 });
    return Response.json({
      datasetVersion: active.version,
      academicYear: active.academicYear,
      publishedAt: active.publishedAt ?? active.createdAt
    });
  };
}
