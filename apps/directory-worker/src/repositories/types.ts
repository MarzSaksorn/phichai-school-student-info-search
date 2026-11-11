import type { ImportJobStatus } from "@phichai/domain";

export type SourceType = "approved_student_xlsx" | "approved_staff_source";
export type IssueSeverity = "error" | "warning";
export type DatasetVersionStatus =
  | "building"
  | "ready"
  | "active"
  | "superseded"
  | "publish_failed"
  | "rolled_back";

export type ImportJob = {
  id: string;
  status: ImportJobStatus;
  sourceType: SourceType;
  academicYear: string;
  parserVersion: string;
  mappingVersion: string;
  uploaderId: string;
  sourceFileIds: string[];
  acceptedRowCount: number;
  rejectedRowCount: number;
  warningRowCount: number;
  blocking: boolean;
  publishedVersionId?: string;
  createdAt: string;
  updatedAt: string;
};

export type CreateImportJobInput = Pick<
  ImportJob,
  "id" | "sourceType" | "academicYear" | "parserVersion" | "mappingVersion" | "uploaderId" | "sourceFileIds"
>;

export type ImportIssue = {
  id: string;
  jobId: string;
  severity: IssueSeverity;
  code: string;
  fileName: string;
  fileId?: string;
  sheetName?: string;
  rowNumber?: number;
  safeMessage: string;
  createdAt: string;
};

export type ImportIssueInput = Omit<ImportIssue, "id" | "createdAt"> & { id?: string };

export type DatasetVersion = {
  id: string;
  version: string;
  academicYear: string;
  status: DatasetVersionStatus;
  parserVersion: string;
  mappingVersion: string;
  sourceFileIds: string[];
  studentCount: number;
  staffCount: number;
  warningCount: number;
  createdBy: string;
  activatedBy?: string;
  createdAt: string;
  publishedAt?: string;
  activatedAt?: string;
  supersededAt?: string;
};

export type CreateDatasetVersionInput = Omit<
  DatasetVersion,
  "createdAt" | "status"
> & { status?: DatasetVersionStatus };

export type AuditEventName =
  | "login"
  | "upload"
  | "validation_started"
  | "validation_completed"
  | "preview_generated"
  | "publish_requested"
  | "publish_succeeded"
  | "publish_failed"
  | "rollback_requested"
  | "rollback_succeeded"
  | "source_deleted"
  | "permission_changed";

export type AuditEvent = {
  id: string;
  event: AuditEventName;
  actorId: string;
  actorRole?: "importer" | "publisher" | "operator" | "owner";
  jobId?: string;
  datasetVersionId?: string;
  outcome: "success" | "failure";
  occurredAt: string;
  requestId?: string;
  safeMetadata?: Record<string, string | number | boolean>;
};

export type AuditEventInput = Omit<AuditEvent, "id" | "occurredAt"> & {
  id?: string;
  occurredAt?: string;
};
