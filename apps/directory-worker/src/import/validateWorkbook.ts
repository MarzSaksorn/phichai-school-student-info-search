import type { ReadWorkbookResult } from "./xlsxReader.js";
import { normalizeSafeText, normalizeStudentRow, type NormalizedStudent, type StudentSourceRow } from "./normalizeStudent.js";
import { assertSchemaConfig, type ImportSchemaConfig } from "./schemaRules.js";

export type ValidationIssue = {
  severity: "error" | "warning";
  code: string;
  fileName: string;
  sheetName?: string;
  rowNumber?: number;
  message: string;
};

export type WorkbookInput = {
  workbook: ReadWorkbookResult;
  fileName: string;
  academicYear: string;
  sourceType: string;
};

export type ValidatedImport = {
  students: NormalizedStudent[];
  issues: ValidationIssue[];
  blocking: boolean;
};

type HeaderMap = {
  identifier: number;
  name: number;
  grade: number;
  room: number;
  status?: number;
};

const aliases: Record<keyof HeaderMap, string[]> = {
  identifier: ["รหัส", "รหัสนักเรียน", "รหัสประจำตัว", "student_id", "studentidentifier"],
  name: ["ชื่อ", "ชื่อ-สกุล", "ชื่อสกุล", "name", "display_name"],
  grade: ["ชั้น", "ระดับชั้น", "grade"],
  room: ["ห้อง", "room"],
  status: ["สถานะ", "status"]
};

function issue(
  base: Pick<ValidationIssue, "severity" | "code" | "fileName" | "message"> &
    Partial<Pick<ValidationIssue, "sheetName" | "rowNumber">>,
  sheetName?: string,
  rowNumber?: number
): ValidationIssue {
  return {
    ...base,
    ...(sheetName && !base.sheetName ? { sheetName } : {}),
    ...(rowNumber && base.rowNumber === undefined ? { rowNumber } : {})
  };
}

function headerIndex(header: unknown[], names: string[]): number {
  const normalized = header.map((value) => normalizeSafeText(String(value ?? "")).toLocaleLowerCase("th-TH"));
  return normalized.findIndex((value) => names.includes(value));
}

function mapHeaders(header: unknown[]): HeaderMap | undefined {
  const identifier = headerIndex(header, aliases.identifier);
  const name = headerIndex(header, aliases.name);
  const grade = headerIndex(header, aliases.grade);
  const room = headerIndex(header, aliases.room);
  if (name < 0 || grade < 0 || room < 0) return undefined;
  const status = headerIndex(header, aliases.status);
  return {
    identifier,
    name,
    grade,
    room,
    ...(status >= 0 ? { status } : {})
  };
}

function cell(row: unknown[], index: number): string | null {
  if (index < 0) return null;
  const value = row[index];
  if (value === null || value === undefined) return null;
  return normalizeSafeText(String(value));
}

function isBlankRow(row: unknown[]): boolean {
  return row.every((value) => normalizeSafeText(value === null || value === undefined ? null : String(value)) === "");
}

export function validateWorkbook(
  input: WorkbookInput,
  config: ImportSchemaConfig
): ValidatedImport {
  assertSchemaConfig(config);
  const issues: ValidationIssue[] = [];
  const students: NormalizedStudent[] = [];
  const identifiers = new Map<string, { sheetName: string; rowNumber: number }>();
  const names = new Map<string, { sheetName: string; rowNumber: number }>();

  if (input.sourceType !== "approved_student_xlsx") {
    return {
      students: [],
      issues: [
        issue({
          severity: "error",
          code: "SOURCE_TYPE_NOT_STUDENT",
          fileName: input.fileName,
          message: "This source type is not accepted by the student-directory importer."
        })
      ],
      blocking: true
    };
  }

  if (input.academicYear !== config.expectedAcademicYear) {
    issues.push(
      issue({
        severity: "error",
        code: "ACADEMIC_YEAR_MISMATCH",
        fileName: input.fileName,
        message: "Workbook academic year does not match the configured import year."
      })
    );
  }

  for (const sheet of input.workbook.sheets) {
    if (!config.studentSheetPattern.test(sheet.name)) {
      issues.push(
        issue({
          severity: "error",
          code: "UNEXPECTED_SHEET",
          fileName: input.fileName,
          sheetName: sheet.name,
          message: "Sheet is not an approved student room sheet."
        })
      );
      continue;
    }

    const headers = sheet.rows[0] ?? [];
    const mapped = mapHeaders(headers);
    if (!mapped) {
      issues.push(
        issue({
          severity: "error",
          code: "MISSING_REQUIRED_COLUMNS",
          fileName: input.fileName,
          sheetName: sheet.name,
          message: "Sheet is missing one or more required student columns."
        })
      );
      continue;
    }

    for (let index = 1; index < sheet.rows.length; index += 1) {
      const row = sheet.rows[index] ?? [];
      const sourceRow = index + 1;
      if (isBlankRow(row)) continue;
      const rowIssueStart = issues.length;
      const source: StudentSourceRow = {
        displayName: cell(row, mapped.name),
        grade: cell(row, mapped.grade),
        room: cell(row, mapped.room),
        ...(mapped.identifier >= 0 ? { studentIdentifier: cell(row, mapped.identifier) } : {}),
        ...(mapped.status !== undefined ? { status: cell(row, mapped.status) } : {})
      };

      let normalized: NormalizedStudent | undefined;
      try {
        normalized = normalizeStudentRow(source, {
          sourceFileId: input.workbook.fileId,
          fileName: input.fileName,
          sheetName: sheet.name,
          sourceRow,
          academicYear: input.academicYear,
          schemaVersion: config.schemaVersion
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Student row is invalid.";
        const code = message.includes("display name")
          ? "BLANK_DISPLAY_NAME"
          : message.includes("grade")
            ? "MISSING_GRADE"
            : "MISSING_ROOM";
        issues.push(
          issue({
            severity: "error",
            code,
            fileName: input.fileName,
            sheetName: sheet.name,
            rowNumber: sourceRow,
            message: code === "BLANK_DISPLAY_NAME"
              ? "Student display name is required."
              : code === "MISSING_GRADE"
                ? "Student grade is required."
                : "Student room is required."
          })
        );
      }

      if (source.grade && !config.gradePattern.test(source.grade)) {
        issues.push(
          issue({
            severity: "error",
            code: "INVALID_GRADE",
            fileName: input.fileName,
            sheetName: sheet.name,
            rowNumber: sourceRow,
            message: "Grade does not match the configured format."
          })
        );
      }
      if (source.room && !config.roomPattern.test(source.room)) {
        issues.push(
          issue({
            severity: "error",
            code: "INVALID_ROOM",
            fileName: input.fileName,
            sheetName: sheet.name,
            rowNumber: sourceRow,
            message: "Room does not match the configured format."
          })
        );
      }

      if (normalized?.studentIdentifier) {
        const previous = identifiers.get(normalized.studentIdentifier);
        if (previous) {
          issues.push(
            issue({
              severity: "error",
              code: "DUPLICATE_IDENTIFIER",
              fileName: input.fileName,
              sheetName: sheet.name,
              rowNumber: sourceRow,
              message: "Student identifier appears more than once in this import."
            })
          );
        } else {
          identifiers.set(normalized.studentIdentifier, { sheetName: sheet.name, rowNumber: sourceRow });
        }
      }
      if (normalized) {
        const nameKey = `${normalized.searchName}:${normalized.grade}:${normalized.room}`;
        if (names.has(nameKey)) {
          issues.push(
            issue({
              severity: "warning",
              code: "DUPLICATE_NAME",
              fileName: input.fileName,
              sheetName: sheet.name,
              rowNumber: sourceRow,
              message: "Multiple rows share a normalized name and require review."
            })
          );
        } else {
          names.set(nameKey, { sheetName: sheet.name, rowNumber: sourceRow });
        }
      }

      const rowHasError = issues.slice(rowIssueStart).some((item) => item.severity === "error");
      if (normalized && !rowHasError) students.push(normalized);
    }
  }

  return {
    students,
    issues,
    blocking: issues.some((item) => item.severity === "error")
  };
}
