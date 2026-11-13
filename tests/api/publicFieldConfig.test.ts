import { describe, expect, it } from "vitest";
import { allowsStudentNumberSearch, exposesStudentNumber } from "../../api/_lib/publicFieldConfig.js";

const approved = {
  student_public_fields: ["displayName", "studentNumber", "grade"],
  student_identifier_search: "exact_only",
  student_identifier_display: "public"
};

describe("approved public student-number policy", () => {
  it("allows display and number search only for the explicit public configuration", () => {
    expect(exposesStudentNumber(approved)).toBe(true);
    expect(allowsStudentNumberSearch(approved)).toBe(true);
  });

  it("fails closed when the active dataset has no approved public field config", () => {
    expect(exposesStudentNumber(null)).toBe(false);
    expect(allowsStudentNumberSearch(null)).toBe(false);
  });

  it("does not display or search numbers when the policy only allows internal display modes", () => {
    const restricted = { ...approved, student_identifier_display: "authenticated_only" };
    expect(exposesStudentNumber(restricted)).toBe(false);
    expect(allowsStudentNumberSearch(restricted)).toBe(false);
  });

  it("does not permit number lookup unless search is approved", () => {
    const displayOnly = { ...approved, student_identifier_search: "disabled" };
    expect(exposesStudentNumber(displayOnly)).toBe(true);
    expect(allowsStudentNumberSearch(displayOnly)).toBe(false);
  });
});
