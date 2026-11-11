import { createHash } from "node:crypto";

export type StudentSourceRow = {
  displayName: string | null;
  studentIdentifier?: string | null;
  grade: string | null;
  room: string | null;
  status?: string | null;
};

export type SourceContext = {
  sourceFileId: string;
  fileName: string;
  sheetName: string;
  sourceRow: number;
  academicYear: string;
  schemaVersion: string;
};

export type NormalizedStudent = {
  publicId: string;
  recordType: "student";
  academicYear: string;
  grade: string;
  room: string;
  displayName: string;
  searchName: string;
  studentIdentifier?: string;
  status?: string;
  sourceFileId: string;
  sourceFileName: string;
  sourceSheet: string;
  sourceRow: number;
  datasetVersion?: string;
};

export class StudentNormalizationError extends Error {
  readonly code = "STUDENT_ROW_INVALID" as const;

  constructor(message: string) {
    super(message);
    this.name = "StudentNormalizationError";
  }
}

export function normalizeSafeText(value: string | null | undefined): string {
  return (value ?? "").normalize("NFKC").trim().replace(/\s+/gu, " ");
}

export function normalizeStudentRow(
  input: StudentSourceRow,
  context: SourceContext
): NormalizedStudent {
  const displayName = normalizeSafeText(input.displayName);
  const grade = normalizeSafeText(input.grade);
  const room = normalizeSafeText(input.room);
  if (!displayName) {
    throw new StudentNormalizationError("Student display name is required");
  }
  if (!grade) {
    throw new StudentNormalizationError("Student grade is required");
  }
  if (!room) {
    throw new StudentNormalizationError("Student room is required");
  }

  const studentIdentifier = normalizeSafeText(input.studentIdentifier);
  const status = normalizeSafeText(input.status);
  const identitySeed = studentIdentifier || `${displayName}:${grade}:${room}`;
  const publicId = `student-${createHash("sha256")
    .update(`${context.sourceFileId}:${context.sourceRow}:${identitySeed}`)
    .digest("hex")
    .slice(0, 24)}`;

  return {
    publicId,
    recordType: "student",
    academicYear: context.academicYear,
    grade,
    room,
    displayName,
    searchName: displayName.toLocaleLowerCase("th-TH"),
    ...(studentIdentifier ? { studentIdentifier } : {}),
    ...(status ? { status } : {}),
    sourceFileId: context.sourceFileId,
    sourceFileName: context.fileName,
    sourceSheet: context.sheetName,
    sourceRow: context.sourceRow
  };
}
