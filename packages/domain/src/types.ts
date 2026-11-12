export type RecordType = "student" | "staff";

export type ImportJobStatus =
  | "uploaded"
  | "scanning"
  | "validating"
  | "rejected"
  | "ready_for_review"
  | "publishing"
  | "indexing"
  | "published"
  | "publish_failed"
  | "rolled_back"
  | "cancelled";

export type PublicStudent = {
  publicId: string;
  recordType: "student";
  displayName: string;
  studentNumber?: string;
  academicYear: string;
  grade: string;
  room: string;
  status?: string;
  publishedAt: string;
};

export type PublicStaff = {
  publicId: string;
  recordType: "staff";
  displayName: string;
  category: string;
  departmentOrSubject?: string;
  title?: string;
  status?: string;
  publishedAt: string;
};

export type PublicResult = PublicStudent | PublicStaff;
