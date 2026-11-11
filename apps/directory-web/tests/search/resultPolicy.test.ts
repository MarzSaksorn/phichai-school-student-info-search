import { describe, expect, it } from "vitest";
import { filterPublicResult } from "../../src/server/resultPolicy.js";
import type { NormalizedStudent } from "../../../directory-worker/src/import/normalizeStudent.js";

const record: NormalizedStudent = {
  publicId: "student-1",
  recordType: "student",
  academicYear: "2569",
  grade: "ม.1",
  room: "1",
  displayName: "เด็กชาย ก้อง",
  searchName: "เด็กชาย ก้อง",
  studentIdentifier: "001",
  status: "ปกติ",
  sourceFileId: "secret-file",
  sourceFileName: "students.xlsx",
  sourceSheet: "M1-1",
  sourceRow: 2
};

describe("public result policy", () => {
  it("returns only the approved public fields", () => {
    const result = filterPublicResult(record, {
      studentPublicFields: ["displayName", "academicYear", "grade", "room"],
      studentIdentifierSearch: "disabled"
    }, "2026-11-11T00:00:00.000Z");

    expect(result).toEqual({
      publicId: "student-1",
      recordType: "student",
      displayName: "เด็กชาย ก้อง",
      academicYear: "2569",
      grade: "ม.1",
      room: "1",
      publishedAt: "2026-11-11T00:00:00.000Z"
    });
    expect(result).not.toHaveProperty("studentIdentifier");
    expect(result).not.toHaveProperty("sourceFileId");
    expect(result).not.toHaveProperty("sourceSheet");
    expect(result).not.toHaveProperty("sourceRow");
  });

  it("includes status only when the approved field policy allows it", () => {
    const result = filterPublicResult(record, {
      studentPublicFields: ["displayName", "academicYear", "grade", "room", "status"],
      studentIdentifierSearch: "disabled"
    }, "2026-11-11T00:00:00.000Z");
    expect(result.status).toBe("ปกติ");
  });
});
