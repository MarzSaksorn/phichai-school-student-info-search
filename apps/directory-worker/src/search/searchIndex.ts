import type { NormalizedStudent } from "../import/normalizeStudent.js";

export type SearchableRecord = NormalizedStudent;

export type SearchIndex = {
  replaceVersion(versionId: string, records: SearchableRecord[]): Promise<void>;
  removeVersion(versionId: string): Promise<void>;
  search(versionId: string, normalizedQuery: string): Promise<SearchableRecord[]>;
};

export class InMemorySearchIndex implements SearchIndex {
  private readonly versions = new Map<string, SearchableRecord[]>();

  async replaceVersion(versionId: string, records: SearchableRecord[]): Promise<void> {
    this.versions.set(versionId, structuredClone(records));
  }

  async removeVersion(versionId: string): Promise<void> {
    this.versions.delete(versionId);
  }

  async search(versionId: string, normalizedQuery: string): Promise<SearchableRecord[]> {
    const records = this.versions.get(versionId) ?? [];
    if (!normalizedQuery) return structuredClone(records);
    return structuredClone(
      records.filter((record) =>
        record.searchName.includes(normalizedQuery) ||
        record.studentIdentifier === normalizedQuery
      )
    );
  }
}
