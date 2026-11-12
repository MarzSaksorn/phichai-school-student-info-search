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
  surnameHeader: "สกุล",
  studentIdentifierRequired: true,
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

  it("skips footer notes that ExcelJS repeats across a merged name column", () => {
    // The approved workbook merges the footer note across B:G, so every cell in the
    // range - including the ชื่อ-สกุล column - reads back as the note text.
    const footerNote = "ณ วันที่ 22 เมษายน 2569   จำนวนนักเรียนทั้งหมด";
    const result = validateWorkbook({
      workbook: {
        fileId: "file-merged-footer-12",
        checksum: "c".repeat(64),
        sheets: [{
          name: "1",
          rows: [
            ["รายชื่อนักเรียนระดับชั้นมัธยมศึกษาปีที่ 1"],
            [],
            [],
            [],
            ["เลขที่", "เลขประจำตัว", "คำนำหน้า", "ชื่อ", "สกุล", "ชื่อ-สกุล"],
            [1, "28441", "เด็กชาย", "ตัวอย่าง", "หนึ่ง", "เด็กชาย ตัวอย่าง หนึ่ง"],
            [2, "28442", "เด็กชาย", "ตัวอย่าง", "สอง", "เด็กชาย ตัวอย่าง สอง"],
            [null, footerNote, footerNote, footerNote, footerNote, footerNote, 36]
          ]
        }]
      },
      fileName: "M.1-69.xlsx",
      academicYear: "2569",
      sourceType: "approved_student_xlsx"
    }, approvedRoomSheetConfig);

    expect(result.students.map((student) => student.displayName)).toEqual([
      "เด็กชาย ตัวอย่าง หนึ่ง",
      "เด็กชาย ตัวอย่าง สอง"
    ]);
    expect(result.students.some((student) => student.displayName.includes("จำนวนนักเรียน"))).toBe(false);
    expect(result.issues).toHaveLength(0);
    expect(result.blocking).toBe(false);
  });

  it("publishes the family name that the workbook keeps in its own column", () => {
    const result = validateWorkbook({
      workbook: {
        fileId: "file-surname-1234",
        checksum: "d".repeat(64),
        sheets: [{
          name: "2",
          rows: [
            [],
            [],
            [],
            [],
            ["เลขที่", "เลขประจำตัว", "คำนำหน้า", "ชื่อ", "สกุล", "ชื่อ-สกุล"],
            [1, "TEST-0001", "เด็กชาย", "ตัวอย่าง", "หนึ่ง", "เด็กชายตัวอย่าง"],
            [2, "TEST-0002", "เด็กหญิง", "ตัวอย่าง", "สอง", "เด็กหญิงตัวอย่าง สอง"]
          ]
        }]
      },
      fileName: "M.1-69.xlsx",
      academicYear: "2569",
      sourceType: "approved_student_xlsx"
    }, approvedRoomSheetConfig);

    expect(result.students.map((student) => student.displayName)).toEqual([
      "เด็กชายตัวอย่าง หนึ่ง",
      "เด็กหญิงตัวอย่าง สอง"
    ]);
    expect(result.students.map((student) => student.searchName)).toEqual([
      "เด็กชายตัวอย่าง หนึ่ง",
      "เด็กหญิงตัวอย่าง สอง"
    ]);
  });

  it("blocks an approved room sheet without the student-number column", () => {
    const result = validateWorkbook({
      workbook: {
        fileId: "file-missing-number-column",
        checksum: "e".repeat(64),
        sheets: [{ name: "1", rows: [[], [], [], [], ["เลขที่", "ชื่อ-สกุล"], [1, "เด็กชาย ตัวอย่าง"]] }]
      },
      fileName: "M.1-69.xlsx",
      academicYear: "2569",
      sourceType: "approved_student_xlsx"
    }, approvedRoomSheetConfig);

    expect(result.blocking).toBe(true);
    expect(result.students).toHaveLength(0);
    expect(result.issues[0]?.code).toBe("MISSING_STUDENT_IDENTIFIER_COLUMN");
  });

  it("rejects a row with no student number from an approved workbook", () => {
    const result = validateWorkbook({
      workbook: {
        fileId: "file-empty-number",
        checksum: "f".repeat(64),
        sheets: [{ name: "1", rows: [[], [], [], [], ["เลขที่", "เลขประจำตัว", "ชื่อ-สกุล"], [1, null, "เด็กชาย ตัวอย่าง"]] }]
      },
      fileName: "M.1-69.xlsx",
      academicYear: "2569",
      sourceType: "approved_student_xlsx"
    }, approvedRoomSheetConfig);

    expect(result.blocking).toBe(false);
    expect(result.students).toHaveLength(0);
    expect(result.issues[0]?.code).toBe("MISSING_STUDENT_IDENTIFIER");
  });
});
