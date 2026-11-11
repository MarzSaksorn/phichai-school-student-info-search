import type { PublicStudent } from "../../../../packages/domain/src/types.js";
import type { DirectoryStore } from "../../../directory-worker/src/db/client.js";
import { getActiveDatasetVersion } from "../../../directory-worker/src/repositories/datasetVersions.js";
import { normalizeSearchQuery, SearchQueryError } from "../../../directory-worker/src/search/normalizeQuery.js";
import type { SearchIndex } from "../../../directory-worker/src/search/searchIndex.js";
import {
  canSearchStudentIdentifier,
  DEFAULT_PUBLIC_FIELD_POLICY,
  filterPublicResult,
  type PublicFieldPolicy
} from "./resultPolicy.js";

export type SearchFilters = {
  recordType?: "student" | "staff" | "all";
  academicYear?: string;
  grade?: string;
  room?: string;
  category?: string;
  departmentOrSubject?: string;
  status?: string;
};

export type SearchRequest = {
  query: string;
  filters?: SearchFilters;
  pageSize: number;
  cursor?: string;
  authenticated?: boolean;
};

export type SearchResponse = {
  items: PublicStudent[];
  nextCursor?: string;
  datasetVersion: string;
  publishedAt: string;
};

export class SearchServiceError extends Error {
  readonly code:
    | "NO_ACTIVE_DATASET"
    | "EMPTY_QUERY_NOT_ALLOWED"
    | "PAGE_SIZE_INVALID"
    | "CURSOR_INVALID"
    | "FILTER_INVALID";

  constructor(code: SearchServiceError["code"], message: string) {
    super(message);
    this.name = "SearchServiceError";
    this.code = code;
  }
}

export type SearchServiceDependencies = {
  store: DirectoryStore;
  index: SearchIndex;
  policy?: PublicFieldPolicy;
};

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

function fingerprint(request: SearchRequest, normalizedQuery: string): string {
  return JSON.stringify({
    query: normalizedQuery,
    filters: request.filters ?? {},
    pageSize: request.pageSize,
    authenticated: request.authenticated === true
  });
}

function encodeCursor(versionId: string, offset: number, key: string): string {
  return Buffer.from(JSON.stringify({ versionId, offset, key }), "utf8").toString("base64url");
}

function decodeCursor(cursor: string, versionId: string, key: string): number {
  try {
    const value = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as {
      versionId?: string;
      offset?: number;
      key?: string;
    };
    if (value.versionId !== versionId || value.key !== key || !Number.isInteger(value.offset) || value.offset === undefined || value.offset < 0) {
      throw new Error("cursor mismatch");
    }
    return value.offset;
  } catch {
    throw new SearchServiceError("CURSOR_INVALID", "Search cursor is invalid or expired");
  }
}

function validateFilters(filters: SearchFilters): void {
  if (filters.recordType && !["student", "staff", "all"].includes(filters.recordType)) {
    throw new SearchServiceError("FILTER_INVALID", "Record type filter is invalid");
  }
  for (const value of Object.values(filters)) {
    if (value !== undefined && (value.length === 0 || value.length > 80)) {
      throw new SearchServiceError("FILTER_INVALID", "A search filter is invalid");
    }
  }
  if (filters.recordType === "staff" || filters.category || filters.departmentOrSubject) {
    throw new SearchServiceError("FILTER_INVALID", "Staff records are not available in this public dataset");
  }
}

function matchesFilters(record: { academicYear: string; grade: string; room: string; status?: string }, filters: SearchFilters): boolean {
  return (!filters.academicYear || record.academicYear === filters.academicYear) &&
    (!filters.grade || record.grade === filters.grade) &&
    (!filters.room || record.room === filters.room) &&
    (!filters.status || record.status === filters.status);
}

function score(record: { searchName: string; studentIdentifier?: string }, query: string, identifierAllowed: boolean): number {
  if (!query) return 10;
  if (identifierAllowed && record.studentIdentifier === query) return 0;
  if (record.searchName === query) return 1;
  if (record.searchName.startsWith(query)) return 2;
  return 3;
}

export function createSearchService(dependencies: SearchServiceDependencies) {
  const policy = dependencies.policy ?? DEFAULT_PUBLIC_FIELD_POLICY;

  return {
    async searchDirectory(request: SearchRequest): Promise<SearchResponse> {
      const pageSize = request.pageSize || DEFAULT_PAGE_SIZE;
      if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > MAX_PAGE_SIZE) {
        throw new SearchServiceError("PAGE_SIZE_INVALID", "Page size is outside the allowed range");
      }
      const filters = request.filters ?? {};
      validateFilters(filters);
      const normalized = normalizeSearchQuery(request.query);
      if (normalized.isEmpty && !filters.grade && !filters.room) {
        throw new SearchServiceError("EMPTY_QUERY_NOT_ALLOWED", "A search term or narrowing filter is required");
      }
      const active = await getActiveDatasetVersion(dependencies.store);
      if (!active) throw new SearchServiceError("NO_ACTIVE_DATASET", "Directory is not currently available");

      const identifierAllowed = canSearchStudentIdentifier(policy, request.authenticated === true);
      const candidates = await dependencies.index.search(active.id, normalized.value);
      const filtered = candidates
        .filter((record) => matchesFilters(record, filters))
        .filter((record) => normalized.isEmpty ||
          record.searchName.includes(normalized.value) ||
          (identifierAllowed && record.studentIdentifier === normalized.value))
        .sort((left, right) => {
          const byScore = score(left, normalized.value, identifierAllowed) - score(right, normalized.value, identifierAllowed);
          if (byScore !== 0) return byScore;
          const byName = left.displayName.localeCompare(right.displayName, "th");
          return byName || left.publicId.localeCompare(right.publicId);
        });

      const key = fingerprint(request, normalized.value);
      const offset = request.cursor ? decodeCursor(request.cursor, active.id, key) : 0;
      const page = filtered.slice(offset, offset + pageSize);
      const nextOffset = offset + page.length;
      const response: SearchResponse = {
        items: page.map((record) => filterPublicResult(record, policy, active.publishedAt ?? active.createdAt)),
        datasetVersion: active.version,
        publishedAt: active.publishedAt ?? active.createdAt
      };
      if (nextOffset < filtered.length) response.nextCursor = encodeCursor(active.id, nextOffset, key);
      return response;
    }
  };
}

export { SearchQueryError };
