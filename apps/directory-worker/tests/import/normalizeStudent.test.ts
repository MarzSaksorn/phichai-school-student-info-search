import { describe, expect, it } from "vitest";
import { normalizeStudentRow } from "../../src/import/normalizeStudent.js";

describe("student row normalization", () => {
  it("normalizes safe whitespace without changing Thai characters or source trace", () => {
    const result = normalizeStudentRow(
      {
        displayName: "  เด็กชาย   ตัวอย่าง  ",
        studentIdentifier: " 001 ",
        grade: " ม.1 ",
        room: " 2 ",
        status: "  ปกติ "
      },
      {
        sourceFileId: "file-1",
        fileName: "students.xlsx",
        sheetName: "M1-2",
        sourceRow: 4,
        academicYear: "2569",
        schemaVersion: "student-v1"
      }
    );

    expect(result.displayName).toBe("เด็กชาย ตัวอย่าง");
    expect(result.searchName).toBe("เด็กชาย ตัวอย่าง");
    expect(result.studentIdentifier).toBe("001");
    expect(result.sourceSheet).toBe("M1-2");
    expect(result.sourceRow).toBe(4);
    expect(result.publicId).toMatch(/^student-[0-9a-f]{24}$/);
    expect(result).not.toHaveProperty("raw");
  });

  it("does not silently normalize a missing required name", () => {
    expect(() =>
      normalizeStudentRow(
        { displayName: " ", grade: "ม.1", room: "1" },
        {
          sourceFileId: "file-1",
          fileName: "students.xlsx",
          sheetName: "M1-1",
          sourceRow: 2,
          academicYear: "2569",
          schemaVersion: "student-v1"
        }
      )
    ).toThrowError(/display name/i);
  });
});
