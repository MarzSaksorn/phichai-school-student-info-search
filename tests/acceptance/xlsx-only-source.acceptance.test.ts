import { describe, expect, it } from "vitest";
import { assertApprovedXlsxSource, SourceGuardError } from "../../apps/directory-worker/src/import/sourceGuard.js";
import { normalizeStudentRow } from "../../apps/directory-worker/src/import/normalizeStudent.js";
import { validateWorkbook } from "../../apps/directory-worker/src/import/validateWorkbook.js";
import type { ReadWorkbookResult } from "../../apps/directory-worker/src/import/xlsxReader.js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const fixture = JSON.parse(readFileSync(resolve(import.meta.dirname, "../fixtures/approved/anonymized-directory-fixture.json"), "utf8")) as {
  sourceType: string;
  students: Array<{ displayName: string; studentIdentifier?: string; grade: string; room: string; academicYear: string; sheet: string; row: number; status?: string }>;
};

describe("acceptance: approved XLSX source boundary", () => {
  it("accepts only manual approved XLSX sources and rejects website origins", () => {
    expect(() => assertApprovedXlsxSource({ sourceType: fixture.sourceType, filename: "fixture.xlsx", origin: "manual-upload" })).not.toThrow();
    expect(() => assertApprovedXlsxSource({ sourceType: fixture.sourceType, filename: "fixture.xlsx", origin: "https://school.example" })).toThrow(SourceGuardError);
    expect(() => assertApprovedXlsxSource({ sourceType: fixture.sourceType, filename: "school.html" })).toThrow(/xlsx/i);
  });

  it("retains restricted XLSX file, sheet, and row traceability for normalized records", () => {
    const row = fixture.students[0];
    const normalized = normalizeStudentRow({
      displayName: row.displayName, studentIdentifier: row.studentIdentifier, grade: row.grade, room: row.room, status: row.status
    }, {
      sourceFileId: "fixture-file", fileName: "fixture.xlsx", sheetName: row.sheet, sourceRow: row.row,
      academicYear: row.academicYear, schemaVersion: "fixture-schema-1"
    });
    expect(normalized.sourceFileName).toBe("fixture.xlsx");
    expect(normalized.sourceSheet).toBe(row.sheet);
    expect(normalized.sourceRow).toBe(row.row);
    expect(normalized.sourceFileId).toBe("fixture-file");
  });

  it("blocks invalid rows rather than producing a publishable validated import", () => {
    const workbook: ReadWorkbookResult = {
      checksumSha256: "a".repeat(64),
      sheets: [{ name: "M1-1", rows: [["รหัส", "ชื่อ", "ชั้น", "ห้อง"], ["1", "", "ม.1", "1"]] }]
    };
    const result = validateWorkbook({ workbook, fileName: "fixture.xlsx", academicYear: "2569", sourceType: fixture.sourceType }, {
      schemaVersion: "fixture-schema-1", expectedAcademicYear: "2569", studentSheetPattern: /^M\d+-\d+$/u,
      gradePattern: /^ม\.\d+$/u, roomPattern: /^\d+$/u
    });
    expect(result.blocking).toBe(true);
    expect(result.students).toHaveLength(0);
    expect(result.issues.some((issue) => issue.severity === "error")).toBe(true);
  });
});
