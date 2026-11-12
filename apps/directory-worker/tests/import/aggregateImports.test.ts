import { describe, expect, it } from "vitest";
import type { NormalizedStudent } from "../../src/import/normalizeStudent.js";
import { aggregateWorkbookValidations } from "../../src/import/aggregateImports.js";

function student(fileName: string, identifier: string, sourceRow: number): NormalizedStudent {
  return {
    publicId: `public-${sourceRow}`,
    recordType: "student",
    academicYear: "2569",
    grade: "ม.1",
    room: "1",
    displayName: `Fixture ${sourceRow}`,
    searchName: `fixture ${sourceRow}`,
    studentIdentifier: identifier,
    sourceFileId: `file-${fileName}`,
    sourceFileName: fileName,
    sourceSheet: "1",
    sourceRow
  };
}

describe("aggregate workbook validations", () => {
  it("combines valid students and warnings from every workbook", () => {
    const result = aggregateWorkbookValidations([
      { fileName: "M.1-69.xlsx", result: { students: [student("M.1-69.xlsx", "ID-1", 6)], issues: [], blocking: false } },
      { fileName: "M.2-69.xlsx", result: { students: [student("M.2-69.xlsx", "ID-2", 6)], issues: [{ severity: "warning", code: "DUPLICATE_NAME", fileName: "M.2-69.xlsx", message: "Multiple rows share a normalized name and require review." }], blocking: false } }
    ]);

    expect(result.students).toHaveLength(2);
    expect(result.issues.map((issue) => issue.code)).toEqual(["DUPLICATE_NAME"]);
    expect(result.blocking).toBe(false);
  });

  it("rejects a duplicate identifier across different workbook files without exposing its value", () => {
    const duplicateNumber = "private-fixture-number";
    const result = aggregateWorkbookValidations([
      { fileName: "M.1-69.xlsx", result: { students: [student("M.1-69.xlsx", duplicateNumber, 6)], issues: [], blocking: false } },
      { fileName: "M.2-69.xlsx", result: { students: [student("M.2-69.xlsx", duplicateNumber, 7)], issues: [], blocking: false } }
    ]);

    expect(result.students).toHaveLength(1);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toMatchObject({ code: "DUPLICATE_IDENTIFIER", fileName: "M.2-69.xlsx", rowNumber: 7 });
    expect(result.issues[0]?.message).not.toContain(duplicateNumber);
  });

  it("preserves workbook-level blocking errors", () => {
    const result = aggregateWorkbookValidations([
      { fileName: "M.1-69.xlsx", result: { students: [], issues: [{ severity: "error", code: "UNEXPECTED_SHEET", fileName: "M.1-69.xlsx", message: "Workbook is invalid." }], blocking: true } }
    ]);
    expect(result.blocking).toBe(true);
  });
});
