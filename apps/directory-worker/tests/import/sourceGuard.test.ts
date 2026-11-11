import { describe, expect, it } from "vitest";
import { SourceGuardError, assertApprovedXlsxSource } from "../../src/import/sourceGuard.js";

describe("approved XLSX source guard", () => {
  it("allows approved manual XLSX uploads", () => {
    expect(() =>
      assertApprovedXlsxSource({
        sourceType: "approved_student_xlsx",
        filename: "students.xlsx",
        origin: "manual-upload"
      })
    ).not.toThrow();
  });

  it("rejects website URLs and website-derived source types before parsing", () => {
    expect(() =>
      assertApprovedXlsxSource({
        sourceType: "website",
        filename: "students.xlsx",
        origin: "https://main.phichai.ac.th/student-list"
      })
    ).toThrowError(SourceGuardError);

    expect(() =>
      assertApprovedXlsxSource({
        sourceType: "approved_student_xlsx",
        filename: "students.xlsx",
        origin: "https://example.com/export.xlsx"
      })
    ).toThrowError(/remote origins are not allowed/i);
  });

  it("rejects unsupported extensions, movement files, and oversized uploads", () => {
    expect(() =>
      assertApprovedXlsxSource({
        sourceType: "approved_student_xlsx",
        filename: "students.csv"
      })
    ).toThrowError(/\.xlsx/i);

    expect(() =>
      assertApprovedXlsxSource({
        sourceType: "movement_file",
        filename: "movement.xlsx"
      })
    ).toThrowError(/source type/i);

    expect(() =>
      assertApprovedXlsxSource({
        sourceType: "approved_student_xlsx",
        filename: "students.xlsx",
        byteSize: 11 * 1024 * 1024
      })
    ).toThrowError(/size/i);
  });
});
