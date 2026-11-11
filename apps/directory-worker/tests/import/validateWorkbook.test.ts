import { describe, expect, it } from "vitest";
import type { ReadWorkbookResult } from "../../src/import/xlsxReader.js";
import { validateWorkbook } from "../../src/import/validateWorkbook.js";
import type { ImportSchemaConfig } from "../../src/import/schemaRules.js";

const config: ImportSchemaConfig = {
  schemaVersion: "student-v1",
  expectedAcademicYear: "2569",
  studentSheetPattern: /^M\d{1,2}-\d{1,2}$/,
  gradePattern: /^ม\.[1-6]$/,
  roomPattern: /^\d{1,2}$/
};

const workbook: ReadWorkbookResult = {
  fileId: "file-abc123456789abcd",
  checksum: "a".repeat(64),
  sheets: [
    {
      name: "M1-1",
      rows: [
        ["รหัส", "ชื่อ", "ชั้น", "ห้อง", "สถานะ"],
        ["001", "เด็กชาย ตัวอย่าง", "ม.1", "1", "ปกติ"],
        ["001", "เด็กหญิง ซ้ำ", "ม.1", "1", "ปกติ"],
        ["002", "", "ม.9", "x", "ปกติ"]
      ]
    },
    {
      name: "Summary",
      rows: [["สรุป", "จำนวน"], ["นักเรียน", 3]]
    }
  ]
};

describe("student workbook validation", () => {
  it("returns normalized valid rows and safe blocking issues", () => {
    const result = validateWorkbook({
      workbook,
      fileName: "students.xlsx",
      academicYear: "2569",
      sourceType: "approved_student_xlsx"
    }, config);

    expect(result.students).toHaveLength(1);
    expect(result.students[0]?.displayName).toBe("เด็กชาย ตัวอย่าง");
    expect(result.blocking).toBe(true);
    expect(result.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "DUPLICATE_IDENTIFIER",
        "BLANK_DISPLAY_NAME",
        "INVALID_GRADE",
        "INVALID_ROOM",
        "UNEXPECTED_SHEET"
      ])
    );
    expect(result.issues.some((issue) => issue.message.includes("เด็กหญิง"))).toBe(false);
  });

  it("rejects academic-year mismatch and movement/staff source types", () => {
    const mismatch = validateWorkbook({
      workbook,
      fileName: "students.xlsx",
      academicYear: "2568",
      sourceType: "approved_student_xlsx"
    }, config);
    expect(mismatch.blocking).toBe(true);
    expect(mismatch.issues.map((issue) => issue.code)).toContain("ACADEMIC_YEAR_MISMATCH");

    const movement = validateWorkbook({
      workbook,
      fileName: "movement.xlsx",
      academicYear: "2569",
      sourceType: "approved_staff_source"
    }, config);
    expect(movement.students).toHaveLength(0);
    expect(movement.issues[0]?.code).toBe("SOURCE_TYPE_NOT_STUDENT");
  });
});
