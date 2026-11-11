import { SearchServiceError, createSearchService, type SearchRequest, type SearchServiceDependencies } from "../../../server/searchService.js";
import { SearchQueryError } from "../../../../../directory-worker/src/search/normalizeQuery.js";
import { createHash, randomUUID } from "node:crypto";
import { appendAuditEvent } from "../../../../../directory-worker/src/repositories/auditEvents.js";
import { defaultClientKey, InMemoryRateLimiter, type RateLimiterOptions } from "../../../server/rateLimit.js";

export type SearchRouteOptions = {
  rateLimiter?: Pick<InMemoryRateLimiter, "check">;
  clientKey?: (request: Request) => string;
  defaultRateLimit?: RateLimiterOptions;
};

function auditActorId(clientKey: string): string {
  return `public:${createHash("sha256").update(clientKey).digest("hex").slice(0, 24)}`;
}

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

export function createSearchRoute(dependencies: SearchServiceDependencies, options: SearchRouteOptions = {}) {
  const service = createSearchService(dependencies);
  const rateLimiter = options.rateLimiter ?? new InMemoryRateLimiter(
    options.defaultRateLimit ?? { limit: 60, windowMs: 60_000 }
  );
  return async function GET(request: Request): Promise<Response> {
    const clientKey = options.clientKey?.(request) ?? defaultClientKey(request);
    const requestId = randomUUID();
    const actorId = auditActorId(clientKey);
    const queryLength = new URL(request.url).searchParams.get("q")?.length ?? 0;
    if (rateLimiter) {
      try {
        const decision = rateLimiter.check(clientKey);
        if (!decision.allowed) {
          await appendAuditEvent(dependencies.store, {
            event: "search_rate_limited",
            actorId,
            outcome: "failure",
            requestId,
            safeMetadata: { queryLength, retryAfterSeconds: decision.retryAfterSeconds ?? 1 }
          });
          return Response.json({ error: "RATE_LIMITED" }, {
            status: 429,
            headers: { "retry-after": String(decision.retryAfterSeconds ?? 1) }
          });
        }
      } catch {
        await appendAuditEvent(dependencies.store, {
          event: "search_failed",
          actorId,
          outcome: "failure",
          requestId,
          safeMetadata: { queryLength, reason: "rate_limiter_unavailable" }
        });
        return Response.json({ error: "SEARCH_UNAVAILABLE" }, { status: 503 });
      }
    }
    try {
      const response = await service.searchDirectory(parseRequest(request));
      await appendAuditEvent(dependencies.store, {
        event: "search_requested",
        actorId,
        outcome: "success",
        requestId,
        safeMetadata: { queryLength, resultCount: response.items.length }
      });
      return Response.json(response, { status: 200 });
    } catch (error) {
      const code = error instanceof SearchServiceError || error instanceof SearchQueryError
        ? error.code
        : "SEARCH_UNAVAILABLE";
      const status = code === "NO_ACTIVE_DATASET" || code === "SEARCH_UNAVAILABLE" ? 503 : 400;
      await appendAuditEvent(dependencies.store, {
        event: "search_failed",
        actorId,
        outcome: "failure",
        requestId,
        safeMetadata: { queryLength, errorCode: code }
      });
      return Response.json({ error: code }, { status });
    }
  };
}
