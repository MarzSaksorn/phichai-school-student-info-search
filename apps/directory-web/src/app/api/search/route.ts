import { SearchServiceError, createSearchService, type SearchRequest, type SearchServiceDependencies } from "../../../server/searchService.js";
import { SearchQueryError } from "../../../../../directory-worker/src/search/normalizeQuery.js";

function parseRequest(request: Request): SearchRequest {
  const url = new URL(request.url);
  const query = url.searchParams.get("q") ?? "";
  const recordType = url.searchParams.get("recordType") as SearchRequest["filters"] extends infer F
    ? F extends { recordType?: infer R } ? R : never : never;
  const filters = {
    ...(recordType ? { recordType } : {}),
    ...(url.searchParams.get("academicYear") ? { academicYear: url.searchParams.get("academicYear") as string } : {}),
    ...(url.searchParams.get("grade") ? { grade: url.searchParams.get("grade") as string } : {}),
    ...(url.searchParams.get("room") ? { room: url.searchParams.get("room") as string } : {}),
    ...(url.searchParams.get("status") ? { status: url.searchParams.get("status") as string } : {})
  };
  const pageSizeRaw = url.searchParams.get("pageSize");
  const pageSize = pageSizeRaw ? Number(pageSizeRaw) : 20;
  return {
    query,
    filters,
    pageSize,
    ...(url.searchParams.get("cursor") ? { cursor: url.searchParams.get("cursor") as string } : {})
  };
}

export function createSearchRoute(dependencies: SearchServiceDependencies) {
  const service = createSearchService(dependencies);
  return async function GET(request: Request): Promise<Response> {
    try {
      const response = await service.searchDirectory(parseRequest(request));
      return Response.json(response, { status: 200 });
    } catch (error) {
      const code = error instanceof SearchServiceError || error instanceof SearchQueryError
        ? error.code
        : "SEARCH_UNAVAILABLE";
      const status = code === "NO_ACTIVE_DATASET" || code === "SEARCH_UNAVAILABLE" ? 503 : 400;
      return Response.json({ error: code }, { status });
    }
  };
}
