# Phichai Global Directory Data Contract

- **Status:** Approved student workbook mapping; remaining staff/retention decisions pending
- **Version:** 1.1.0
- **Date:** 2026-11-11
- **Owner:** School data administrators with the implementation team

This contract separates source data, restricted normalized records, published public results, import lifecycle state, immutable dataset versions, and audit events. Production ingestion is blocked until the school approves the policy inputs marked **School decision**.

## Contract rules

1. Approved XLSX exports are the only student source of truth.
2. The current school website is never an input, synchronization source, or overwrite source.
3. Source trace fields are restricted to authorized administrators and audit processes.
4. Public responses contain only the allowlisted fields in this document's public-result section.
5. A dataset version is immutable after creation. Only the active-version pointer changes.
6. Academic years use an explicit configured format; the importer must reject values outside the configured rule.
7. Student and staff sources are separate. Student workbooks do not create staff records.

## Common scalar types

```ts
export type RecordType = "student" | "staff";
export type AcademicYear = string; // validated against configured school format
export type ISODateTime = string; // RFC 3339 / ISO-8601 UTC
export type UUID = string;

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

export type IssueSeverity = "error" | "warning";
export type AuditOutcome = "success" | "failure";
```

## Source rows

Source rows represent values as read from an approved workbook. They are not public and should not be passed to public web components.

```ts
export type SourceContext = {
  sourceFileId: UUID;
  fileName: string;
  sheetName: string;
  sourceRow: number;
  academicYear: AcademicYear;
  schemaVersion: string;
};

export type StudentSourceRow = {
  displayName: string | null;
  studentIdentifier?: string | null;
  grade: string | null;
  room: string | null;
  status?: string | null;
  // Additional columns may be retained only in restricted raw storage and must
  // be explicitly mapped before they can enter a normalized record.
  [key: string]: unknown;
};

export type StaffSourceRow = {
  displayName: string | null;
  category: string | null;
  departmentOrSubject?: string | null;
  title?: string | null;
  status?: string | null;
  [key: string]: unknown;
};
```

Required source values and accepted mappings are configured per schema version. A blank name is a blocking error. Blank or invalid grade, room, category, or other school-required values are blocking errors unless the approved schema explicitly marks the field optional.

## Restricted normalized records

Normalized records contain stable searchable forms and source traceability. They are internal records and must never be serialized directly in a public response.

```ts
export type NormalizedStudent = {
  publicId: UUID;
  recordType: "student";
  academicYear: AcademicYear;
  grade: string;
  room: string;
  displayName: string;
  searchName: string;
  studentIdentifier?: string;
  status?: string;
  sourceFileId: UUID;
  sourceFileName: string;
  sourceSheet: string;
  sourceRow: number;
  datasetVersion?: string;
};

export type NormalizedStaff = {
  publicId: UUID;
  recordType: "staff";
  displayName: string;
  searchName: string;
  category: string;
  departmentOrSubject?: string;
  title?: string;
  status?: string;
  sourceFileId: UUID;
  sourceFileName: string;
  sourceSheet?: string;
  sourceRow?: number;
  datasetVersion?: string;
};
```

Normalization may trim and normalize safe whitespace and Unicode composition. It must not remove meaningful Thai characters, invent transliterations, merge people, or perform AI identity matching. Duplicate identifiers and ambiguous duplicate names are handled by validation and deterministic search ordering, not automatic merging.

## Public result allowlist

The public API may return only these fields unless the school approves a contract revision:

```ts
export type PublicStudent = {
  publicId: string;
  recordType: "student";
  displayName: string;
  studentNumber?: string;
  academicYear: string;
  grade: string;
  room: string;
  status?: string;
  publishedAt: ISODateTime;
};

export type PublicStaff = {
  publicId: string;
  recordType: "staff";
  displayName: string;
  category: string;
  departmentOrSubject?: string;
  title?: string;
  status?: string;
  publishedAt: ISODateTime;
};
```

`studentIdentifier` remains an internal field name; the public API may expose its value as `studentNumber` only when the dataset is linked to an `approved_field_config` version that allows public display and approved number search. Search terms containing only digits use prefix-match semantics, so a query such as `269` matches identifiers beginning with `269`. `searchName`, `sourceFileId`, `sourceFileName`, `sourceSheet`, `sourceRow`, raw workbook values, internal database IDs, and audit details remain private. The school-approved version `phichai-student-number-public-v1` records this decision; missing or restrictive policy config fails closed.

## Import jobs and issues

```ts
export type ImportJob = {
  id: UUID;
  status: ImportJobStatus;
  sourceType: "approved_student_xlsx" | "approved_staff_source";
  academicYear: AcademicYear;
  parserVersion: string;
  mappingVersion: string;
  uploaderId: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  publishedVersionId?: UUID;
  sourceFileIds: UUID[];
  acceptedRowCount: number;
  rejectedRowCount: number;
  warningRowCount: number;
  blocking: boolean;
};

export type ImportIssue = {
  id: UUID;
  jobId: UUID;
  severity: IssueSeverity;
  code: string;
  fileId?: UUID;
  fileName: string;
  sheetName?: string;
  rowNumber?: number;
  safeMessage: string;
  createdAt: ISODateTime;
};
```

Issue messages must be safe for authorized administrator views and must not be exposed through unauthenticated routes. Raw row values are not part of the issue contract.

## Dataset versions

```ts
export type DatasetVersionStatus =
  | "building"
  | "ready"
  | "active"
  | "superseded"
  | "publish_failed"
  | "rolled_back";

export type DatasetVersion = {
  id: UUID;
  version: string; // unique, immutable identifier
  academicYear: AcademicYear;
  status: DatasetVersionStatus;
  parserVersion: string;
  mappingVersion: string;
  sourceFileIds: UUID[];
  studentCount: number;
  staffCount: number;
  warningCount: number;
  createdAt: ISODateTime;
  publishedAt?: ISODateTime;
  activatedAt?: ISODateTime;
  supersededAt?: ISODateTime;
  createdBy: string;
  activatedBy?: string;
};
```

At most one dataset version is active. Activation is transactional. A failed build, index, health check, or switch leaves the previous active version unchanged.

## Audit events

```ts
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
  id: UUID;
  event: AuditEventName;
  actorId: string;
  actorRole?: "importer" | "publisher" | "operator" | "owner";
  jobId?: UUID;
  datasetVersionId?: UUID;
  outcome: AuditOutcome;
  occurredAt: ISODateTime;
  requestId?: string;
  safeMetadata?: Record<string, string | number | boolean>;
};
```

Audit metadata must not contain raw student names, raw identifiers, search terms by default, workbook cell values, or secrets.

## Approved field configuration

The approved field policy is versioned and effective-dated:

```ts
export type ApprovedFieldConfig = {
  version: string;
  effectiveFrom: ISODateTime;
  studentPublicFields: Array<"displayName" | "studentNumber" | "academicYear" | "grade" | "room" | "status">;
  staffPublicFields: Array<"displayName" | "category" | "departmentOrSubject" | "title" | "status">;
  studentIdentifierSearch: "disabled" | "exact_only" | "authenticated_exact_only";
  studentIdentifierDisplay: "disabled" | "masked" | "authenticated_only" | "public";
  noResultDisclosure: "generic";
};
```

The default remains no public student-number display unless an approved config is tied to the active dataset. The school-approved `phichai-student-number-public-v1` policy allows public display and approved number-prefix search; source metadata and raw identifiers are never logged.

## State semantics

- `uploaded`: source files recorded; no records are live.
- `scanning`: file type, size, checksum, and malware/content checks are running.
- `validating`: workbook structure and row validation are running.
- `rejected`: blocking issue found; live dataset is unchanged.
- `ready_for_review`: validation passed with zero blocking issues; publication awaits an authorized confirmation.
- `publishing` / `indexing`: immutable version and search records are being built; old version remains live.
- `published`: version successfully activated and searchable.
- `publish_failed`: publication failed; old version remains live.
- `rolled_back`: version was previously active and has been replaced by a prior version.
- `cancelled`: administrator stopped the job before activation.

## School decisions required before production

- Confirm academic-year format and grade mapping.
- Approve public fields and identifier policy.
- Confirm the staff source and categories.
- Define status, movement, transfer, and withdrawal behavior.
- Set freshness thresholds and retention periods.
- Assign administrator roles and approve identity provider.

## Approved student workbook mapping (2026-11-12)

The school-approved `student-xlsx-room-sheets-v1` mapping accepts a complete cohort of six approved files, `M.1-69.xlsx` through `M.6-69.xlsx`, one for each grade and academic year. The header row is row 5. Grade is derived from the filename (`M.1-69.xlsx` → `ม.1`), and room is derived from the trimmed numeric sheet name (`" 1"` → `1`). The display name combines `ชื่อ-สกุล` and `สกุล`. A nonempty student number is required for every accepted row, and duplicates are rejected across the full six-file cohort. The identifier remains an internal `studentIdentifier` field; the active `phichai-student-number-public-v1` field configuration exposes its value as `studentNumber` and permits approved number-prefix search. Status is omitted unless a separately approved source field is added. Staff records are not created by this student mapping.

## Release evidence and fixture rules

Every production release must retain evidence for source provenance, validation counts, public-field policy, representative searches, accessibility review, benchmark results, active-version verification, and rollback readiness. Repository acceptance fixtures must be synthetic or anonymized, must not contain production names or identifiers, and must cover duplicate names, multiple grades and rooms, invalid rows, staff categories, and multiple academic years.
