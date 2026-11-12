import { describe, expect, it } from "vitest";
import { createInMemoryDirectoryStore } from "../../../directory-worker/src/db/client.js";
import { activateDatasetVersion, createDatasetVersion } from "../../../directory-worker/src/repositories/datasetVersions.js";
import { InMemorySearchIndex } from "../../../directory-worker/src/search/searchIndex.js";
import { createSearchService } from "../../src/server/searchService.js";
import type { NormalizedStudent } from "../../../directory-worker/src/import/normalizeStudent.js";

const records: NormalizedStudent[] = [
  { publicId: "student-1", recordType: "student", academicYear: "2569", grade: "ม.1", room: "1", displayName: "เด็กชาย ก้อง", searchName: "เด็กชาย ก้อง", studentIdentifier: "001", status: "ปกติ", sourceFileId: "private", sourceFileName: "private.xlsx", sourceSheet: "M1-1", sourceRow: 2 },
  { publicId: "student-2", recordType: "student", academicYear: "2569", grade: "ม.1", room: "1", displayName: "เด็กหญิง ก้อง", searchName: "เด็กหญิง ก้อง", studentIdentifier: "002", sourceFileId: "private", sourceFileName: "private.xlsx", sourceSheet: "M1-1", sourceRow: 3 },
  { publicId: "student-3", recordType: "student", academicYear: "2569", grade: "ม.2", room: "2", displayName: "Alice Smith", searchName: "alice smith", studentIdentifier: "003", sourceFileId: "private", sourceFileName: "private.xlsx", sourceSheet: "M2-2", sourceRow: 2 }
];

async function seeded(policy?: Parameters<typeof createSearchService>[0]["policy"]) {
  const store = createInMemoryDirectoryStore();
  const index = new InMemorySearchIndex();
  const version = await createDatasetVersion(store, {
    id: "version-live",
    version: "2569.1",
    academicYear: "2569",
    parserVersion: "parser-1",
    mappingVersion: "mapping-1",
    sourceFileIds: ["private"],
    studentCount: records.length,
    staffCount: 0,
    warningCount: 0,
    createdBy: "owner-1"
  });
  await index.replaceVersion(version.id, records);
  await activateDatasetVersion(store, version.id, "owner-1");
  return {
    service: createSearchService({ store, index, ...(policy ? { policy } : {}) }),
    store,
    index
  };
}

describe("public search service", () => {
  it("supports partial Thai and Latin search with deterministic ordering", async () => {
    const { service } = await seeded();
    const thai = await service.searchDirectory({ query: "ก้อง", pageSize: 10 });
    expect(thai.items.map((item) => item.publicId)).toEqual(["student-1", "student-2"]);
    const latin = await service.searchDirectory({ query: "ALICE", pageSize: 10 });
    expect(latin.items[0]?.displayName).toBe("Alice Smith");
  });

  it("applies combined filters and cursor pagination consistently", async () => {
    const { service } = await seeded();
    const first = await service.searchDirectory({ query: "ก้อง", filters: { grade: "ม.1", room: "1" }, pageSize: 1 });
    expect(first.items).toHaveLength(1);
    expect(first.nextCursor).toBeDefined();
    const second = await service.searchDirectory({
      query: "ก้อง",
      filters: { grade: "ม.1", room: "1" },
      pageSize: 1,
      ...(first.nextCursor ? { cursor: first.nextCursor } : {})
    });
    expect(second.items).toHaveLength(1);
    expect(second.items[0]?.publicId).not.toBe(first.items[0]?.publicId);
  });

  it("lists the whole roster when no query is supplied", async () => {
    const { service } = await seeded();
    const roster = await service.searchDirectory({ query: "", pageSize: 10 });
    expect(roster.items).toHaveLength(records.length);
    expect(roster.items.every((item) => item.displayName.length > 0)).toBe(true);
    const narrowed = await service.searchDirectory({ query: "", filters: { grade: "ม.2" }, pageSize: 10 });
    expect(narrowed.items).toHaveLength(1);
  });

  it("shows student numbers and supports exact public number search only", async () => {
    const enabled = await seeded();
    const exact = await enabled.service.searchDirectory({ query: "001", pageSize: 10 });
    expect(exact.items).toHaveLength(1);
    expect(exact.items[0]).toMatchObject({ publicId: "student-1", studentNumber: "001" });
    expect((await enabled.service.searchDirectory({ query: "00", pageSize: 10 })).items).toHaveLength(0);

    const disabled = await seeded({
      studentPublicFields: ["displayName", "academicYear", "grade", "room"],
      studentIdentifierSearch: "disabled"
    });
    expect((await disabled.service.searchDirectory({ query: "001", pageSize: 10 })).items).toHaveLength(0);
  });

  it("rejects oversized pages and invalid cursors", async () => {
    const { service } = await seeded();
    await expect(service.searchDirectory({ query: "ก้อง", pageSize: 51 })).rejects.toMatchObject({ code: "PAGE_SIZE_INVALID" });
    await expect(service.searchDirectory({ query: "ก้อง", pageSize: 10, cursor: "bad" })).rejects.toMatchObject({ code: "CURSOR_INVALID" });
  });
});
