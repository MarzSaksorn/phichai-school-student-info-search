export const MAX_QUERY_LENGTH = 120;

export type NormalizedQuery = {
  value: string;
  isEmpty: boolean;
};

export class SearchQueryError extends Error {
  readonly code: "QUERY_TOO_LONG" | "QUERY_INVALID";

  constructor(code: "QUERY_TOO_LONG" | "QUERY_INVALID", message: string) {
    super(message);
    this.name = "SearchQueryError";
    this.code = code;
  }
}

export function normalizeSearchQuery(query: string): NormalizedQuery {
  if (typeof query !== "string") {
    throw new SearchQueryError("QUERY_INVALID", "Search query must be text");
  }
  const value = query.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase("th-TH");
  if (value.length > MAX_QUERY_LENGTH) {
    throw new SearchQueryError("QUERY_TOO_LONG", "Search query is too long");
  }
  return { value, isEmpty: value.length === 0 };
}
