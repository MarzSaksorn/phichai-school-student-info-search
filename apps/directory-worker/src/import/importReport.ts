import type { ValidatedImport, ValidationIssue } from "./validateWorkbook.js";

export type ImportReport = {
  acceptedRowCount: number;
  rejectedRowCount: number;
  warningRowCount: number;
  blocking: boolean;
  issues: ValidationIssue[];
};

export function buildImportReport(result: ValidatedImport): ImportReport {
  const errorRows = new Set(
    result.issues
      .filter((issue) => issue.severity === "error" && issue.rowNumber !== undefined)
      .map((issue) => `${issue.sheetName ?? ""}:${issue.rowNumber}`)
  );
  const rejectedRowCount = errorRows.size > 0
    ? errorRows.size
    : result.issues.filter((issue) => issue.severity === "error").length;

  return {
    acceptedRowCount: result.students.length,
    rejectedRowCount,
    warningRowCount: result.issues.filter((issue) => issue.severity === "warning").length,
    blocking: result.blocking,
    issues: result.issues.map((issue) => ({ ...issue }))
  };
}
