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

const approvedRoomSheetConfig: ImportSchemaConfig = {
  schemaVersion: "student-xlsx-room-sheets-v1",
  expectedAcademicYear: "2569",
  studentSheetPattern: /^\d{1,2}$/u,
  gradePattern: /^ม\.[1-6]$/u,
  roomPattern: /^\d{1,2}$/u,
  headerRow: 5,
  displayNameHeader: "ชื่อ-สกุล",
  deriveGradeFromFilename: (filename) => filename.match(/^M\.(\d)-\d{2}\.xlsx$/iu)?.[1] ? `ม.${filename.match(/^M\.(\d)-\d{2}\.xlsx$/iu)?.[1]}` : null,
  deriveRoomFromSheet: true
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

  it("keeps valid rows publishable when only individual rows are invalid", () => {
    const result = validateWorkbook({
      workbook: { ...workbook, sheets: [workbook.sheets[0]!] },
      fileName: "students.xlsx",
      academicYear: "2569",
      sourceType: "approved_student_xlsx"
    }, config);

    expect(result.students).toHaveLength(1);
    expect(result.blocking).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["DUPLICATE_IDENTIFIER", "BLANK_DISPLAY_NAME", "INVALID_GRADE", "INVALID_ROOM"])
    );
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

  it("maps the approved filename grade and room sheet name without grade/room columns", () => {
    const result = validateWorkbook({
      workbook: {
        fileId: "file-room-sheet-1234",
        checksum: "b".repeat(64),
        sheets: [{
          name: " 1",
          rows: [
            ["รายชื่อนักเรียน"],
            ["ชั้น ม.1"],
            ["ปีการศึกษา 2569"],
            [],
            ["เลขที่", "เลขประจำตัว", "คำนำหน้า", "ชื่อ", "สกุล", "ชื่อ-สกุล"],
            [1, "001", "เด็กชาย", "ตัวอย่าง", "หนึ่ง", "เด็กชาย ตัวอย่าง หนึ่ง"],
            [null, "ณ วันที่ 22 เมษายน 2569   จำนวนนักเรียนทั้งหมด", null, null, null, null, null, 40]
          ]
        }]
      },
      fileName: "M.1-69.xlsx",
      academicYear: "2569",
      sourceType: "approved_student_xlsx"
    }, approvedRoomSheetConfig);

    expect(result.blocking).toBe(false);
    expect(result.issues).toHaveLength(0);
    expect(result.students).toHaveLength(1);
    expect(result.students[0]).toMatchObject({ grade: "ม.1", room: "1", displayName: "เด็กชาย ตัวอย่าง หนึ่ง", studentIdentifier: "001" });
  });
});
