import type { NormalizedStudent } from "./normalizeStudent.js";
import type { ValidatedImport, ValidationIssue } from "./validateWorkbook.js";

export type WorkbookValidation = {
  fileName: string;
  result: ValidatedImport;
};

export function aggregateWorkbookValidations(
  files: WorkbookValidation[]
): ValidatedImport {
  const issues: ValidationIssue[] = files.flatMap(({ result }) => result.issues);
  const students: NormalizedStudent[] = [];
  const identifiers = new Set<string>();
  let blocking = false;

  for (const { result } of files) {
    blocking ||= result.blocking;
    for (const student of result.students) {
      const identifier = student.studentIdentifier?.trim();
      if (identifier && identifiers.has(identifier)) {
        issues.push({
          severity: "error",
          code: "DUPLICATE_IDENTIFIER",
          fileName: student.sourceFileName,
          sheetName: student.sourceSheet,
          rowNumber: student.sourceRow,
          message: "Student identifier appears more than once in this import."
        });
        continue;
      }
      if (identifier) identifiers.add(identifier);
      students.push(student);
    }
  }

  return { students, issues, blocking };
}
