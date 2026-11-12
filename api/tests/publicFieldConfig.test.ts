import { describe, expect, it } from "vitest";
import { allowsExactStudentNumberSearch, exposesStudentNumber } from "../_lib/publicFieldConfig.js";

const approved = {
  student_public_fields: ["displayName", "studentNumber", "grade"],
  student_identifier_search: "exact_only",
  student_identifier_display: "public"
};

describe("approved public student-number policy", () => {
  it("allows display and exact search only for the explicit public configuration", () => {
    expect(exposesStudentNumber(approved)).toBe(true);
    expect(allowsExactStudentNumberSearch(approved)).toBe(true);
  });

  it("fails closed when the active dataset has no approved public field config", () => {
    expect(exposesStudentNumber(null)).toBe(false);
    expect(allowsExactStudentNumberSearch(null)).toBe(false);
  });

  it("does not display or search numbers when the policy only allows internal display modes", () => {
    const restricted = { ...approved, student_identifier_display: "authenticated_only" };
    expect(exposesStudentNumber(restricted)).toBe(false);
    expect(allowsExactStudentNumberSearch(restricted)).toBe(false);
  });

  it("does not permit number lookup unless exact search is approved", () => {
    const displayOnly = { ...approved, student_identifier_search: "disabled" };
    expect(exposesStudentNumber(displayOnly)).toBe(true);
    expect(allowsExactStudentNumberSearch(displayOnly)).toBe(false);
  });
});
