import type { PublicStudent } from "../../../../packages/domain/src/types.js";
import type { NormalizedStudent } from "../../../directory-worker/src/import/normalizeStudent.js";

export type PublicFieldPolicy = {
  studentPublicFields: Array<"displayName" | "studentNumber" | "academicYear" | "grade" | "room" | "status">;
  studentIdentifierSearch: "disabled" | "exact_only" | "authenticated_exact_only";
};

export const DEFAULT_PUBLIC_FIELD_POLICY: PublicFieldPolicy = {
  studentPublicFields: ["displayName", "studentNumber", "academicYear", "grade", "room"],
  studentIdentifierSearch: "exact_only"
};

export function filterPublicResult(
  record: NormalizedStudent,
  policy: PublicFieldPolicy,
  publishedAt: string
): PublicStudent {
  const result: PublicStudent = {
    publicId: record.publicId,
    recordType: "student",
    displayName: record.displayName,
    academicYear: record.academicYear,
    grade: record.grade,
    room: record.room,
    publishedAt
  };
  if (policy.studentPublicFields.includes("studentNumber") && record.studentIdentifier) {
    result.studentNumber = record.studentIdentifier;
  }
  if (policy.studentPublicFields.includes("status") && record.status) {
    result.status = record.status;
  }
  return result;
}

export function canSearchStudentIdentifier(policy: PublicFieldPolicy, authenticated = false): boolean {
  return policy.studentIdentifierSearch === "exact_only" ||
    (policy.studentIdentifierSearch === "authenticated_exact_only" && authenticated);
}
