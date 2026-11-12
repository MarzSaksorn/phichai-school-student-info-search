import { describe, expect, it } from "vitest";
import { validateSchoolWorkbookSet } from "../../api/_lib/studentWorkbookSet.js";

const files = [1, 2, 3, 4, 5, 6].map((grade) => ({ filename: `M.${grade}-69.xlsx` }));

describe("school workbook set validation", () => {
  it("accepts exactly one approved workbook for each grade in the selected year", () => {
    expect(validateSchoolWorkbookSet(files, "2569")).toBeNull();
  });

  it("requires all six grade workbooks so publishing cannot replace the school directory with one grade", () => {
    expect(validateSchoolWorkbookSet(files.slice(0, 1), "2569")).toBe("ALL_SIX_GRADE_WORKBOOKS_REQUIRED");
  });

  it("rejects duplicate grades", () => {
    const duplicate = [...files.slice(0, 5), { filename: "M.5-69.xlsx" }];
    expect(validateSchoolWorkbookSet(duplicate, "2569")).toBe("DUPLICATE_GRADE_WORKBOOK");
  });

  it("rejects a workbook whose year suffix does not match the selected academic year", () => {
    const mismatched = [...files.slice(0, 5), { filename: "M.6-68.xlsx" }];
    expect(validateSchoolWorkbookSet(mismatched, "2569")).toBe("SCHOOL_WORKBOOK_YEAR_MISMATCH");
  });

  it("rejects filenames outside the approved grade-workbook pattern", () => {
    const invalid = [...files.slice(0, 5), { filename: "students.xlsx" }];
    expect(validateSchoolWorkbookSet(invalid, "2569")).toBe("SCHOOL_WORKBOOK_NAME_INVALID");
  });
});
