import { describe, expect, it } from "vitest";
import { buildImportReport } from "../../src/import/importReport.js";

describe("safe import reports", () => {
  it("summarizes validation outcomes without raw student values", () => {
    const report = buildImportReport({
      students: [
        {
          publicId: "student-1",
          recordType: "student",
          academicYear: "2569",
          grade: "ม.1",
          room: "1",
          displayName: "เด็กชาย ตัวอย่าง",
          searchName: "เด็กชาย ตัวอย่าง",
          sourceFileId: "file-1",
          sourceFileName: "students.xlsx",
          sourceSheet: "M1-1",
          sourceRow: 2
        }
      ],
      issues: [
        {
          severity: "warning",
          code: "DUPLICATE_NAME",
          fileName: "students.xlsx",
          sheetName: "M1-1",
          rowNumber: 3,
          message: "Multiple rows share a normalized name and require review."
        },
        {
          severity: "error",
          code: "INVALID_ROOM",
          fileName: "students.xlsx",
          sheetName: "M1-1",
          rowNumber: 4,
          message: "Room does not match the configured format."
        }
      ],
      blocking: true
    });

    expect(report).toMatchObject({
      acceptedRowCount: 1,
      rejectedRowCount: 1,
      warningRowCount: 1,
      blocking: true
    });
    expect(JSON.stringify(report)).not.toContain("เด็กชาย");
    expect(JSON.stringify(report)).not.toContain("001");
    expect(report.issues[0]).toMatchObject({ fileName: "students.xlsx", rowNumber: 3 });
  });
});
