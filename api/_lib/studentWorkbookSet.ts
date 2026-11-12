export const REQUIRED_SCHOOL_GRADES = ["1", "2", "3", "4", "5", "6"] as const;

export type WorkbookFileDescriptor = {
  filename: string;
};

export function validateSchoolWorkbookSet(
  files: WorkbookFileDescriptor[],
  academicYear: string
): string | null {
  if (!/^\d{4}$/u.test(academicYear)) return "ACADEMIC_YEAR_INVALID";
  if (files.length !== REQUIRED_SCHOOL_GRADES.length) {
    return "ALL_SIX_GRADE_WORKBOOKS_REQUIRED";
  }

  const seenGrades = new Set<string>();
  const expectedYearSuffix = academicYear.slice(-2);
  for (const file of files) {
    const basename = file.filename.split(/[\\/]/u).pop() ?? file.filename;
    const match = /^M\.([1-6])-(\d{2})\.xlsx$/iu.exec(basename);
    if (!match) return "SCHOOL_WORKBOOK_NAME_INVALID";
    const grade = match[1];
    const yearSuffix = match[2];
    if (!grade || !yearSuffix) return "SCHOOL_WORKBOOK_NAME_INVALID";
    if (yearSuffix !== expectedYearSuffix) return "SCHOOL_WORKBOOK_YEAR_MISMATCH";
    if (seenGrades.has(grade)) return "DUPLICATE_GRADE_WORKBOOK";
    seenGrades.add(grade);
  }

  if (seenGrades.size !== REQUIRED_SCHOOL_GRADES.length) {
    return "ALL_SIX_GRADE_WORKBOOKS_REQUIRED";
  }
  return null;
}
