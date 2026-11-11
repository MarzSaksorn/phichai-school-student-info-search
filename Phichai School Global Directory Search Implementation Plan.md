# Phichai School Global Directory Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a production-ready global student and staff search system whose student records come only from approved XLSX exports, with validated imports, versioned publication, privacy-filtered search, and a Thai-first public interface.

**Architecture:** Use two lanes: a protected administrator import lane and a public search lane. XLSX files enter through an asynchronous import job, are validated and normalized into versioned records, and are atomically published to a search index. The public UI calls a search service that applies indexed matching, filters, pagination, result-field policy, and freshness metadata; the existing school website is a compatibility reference only.

**Tech Stack:** TypeScript and Next.js for public/admin web routes deployed on Vercel; Supabase Postgres for metadata and normalized records; Supabase Storage for private raw XLSX files and reports; Supabase Auth with the school-approved OIDC-compatible identity provider when available; and a search adapter backed initially by PostgreSQL `pg_trgm` plus indexed normalized fields. Keep the search adapter behind an interface so it can move to a dedicated search engine if Thai-search benchmarks require it. Background import work runs in a retryable TypeScript worker using durable Supabase job records.

**Spec:** `/home/ubuntu/PRD-phichai-global-directory-comprehensive.md`

**Architecture diagram:** `/home/ubuntu/phichai-flowchart/phichai-xlsx-search-architecture.html`

## Global Constraints

- Approved XLSX exports are the sole source of truth for student records.
- The current school website student directory must not be scraped, imported, synchronized, or used to overwrite XLSX-derived records.
- A failed or invalid import must never change the current live dataset.
- Publication must be versioned and atomic from the public user’s perspective.
- Raw XLSX files, row-level errors, source locations, and audit traces are restricted to authorized administrators.
- The public search API returns only school-approved fields and uses pagination and rate limits.
- The system must not send student data to third-party search, analytics, advertising, or AI services.
- Thai-first search and UI are required; Latin text is supported where present in the source data.
- Public results show academic year and last-published time.
- The UI follows the attached Dribbble-inspired system: white canvas, near-black ink, restrained pink emphasis, charcoal pill actions, soft blush notices, acid lime used selectively, and no gradients or glass effects.
- Target p95 search response is <= 500 ms for the agreed pilot dataset and filter combinations.
- Target successful publish-to-search availability is <= 15 minutes.
- Release must pass keyboard, focus, contrast, responsive, privacy, and enumeration-abuse checks.

## Review Focus

- **Source-boundary failure:** a website URL or website-derived record must be impossible to import; test the source selector and import API.
- **Workbook variation:** room-per-sheet files, unexpected sheets, blank values, duplicate identifiers, malformed files, and academic-year mismatches must produce explicit validation outcomes.
- **Atomic publication:** validation, indexing, or publication failure must leave the previous live dataset untouched; test failure injection and rollback.
- **Thai search and ambiguity:** partial Thai names, duplicate names, combined filters, and stable pagination must return safe, understandable results; test against approved fixtures.
- **Privacy and enumeration:** unapproved fields, oversized page requests, empty queries, sequential identifiers, and no-result behavior must not expose the full dataset or sensitive enrollment information.

---

## Task 0: Confirm repository and deployment decisions

**Files:**
- Create: `docs/architecture/decisions/0001-runtime-and-storage.md`
- Create: `docs/architecture/data-contract.md`
- Create: `docs/runbooks/import-publish.md`
- Test: `docs/architecture/decisions/0001-runtime-and-storage.md` reviewed against the PRD and architecture diagram

**Interfaces:**
- Consumes: PRD sections 5–12 and architecture diagram.
- Produces: confirmed repository layout, runtime choices, environment variables, storage boundaries, data contract ownership, and deployment assumptions for all later tasks.

- [ ] **Step 1: Write the decision record**

Document the selected TypeScript application layout, PostgreSQL schema ownership, object-storage bucket/prefix policy, background-job execution method, search-adapter choice, admin authentication provider, and local/test environments. If the recommended stack changes, record the reason and preserve the interfaces named in later tasks.

- [ ] **Step 2: Write the versioned data contract**

Define `StudentSourceRow`, `StaffSourceRow`, `NormalizedStudent`, `NormalizedStaff`, `ImportJob`, `DatasetVersion`, and `AuditEvent`. Include required fields, public-field allowlist, source trace fields, academic-year format, and status semantics. Mark unresolved school decisions as explicit configuration inputs, not hidden defaults.

- [ ] **Step 3: Write the import/publish runbook**

Document who uploads, who approves, who publishes, how to inspect validation errors, how to verify the active version, how to rollback, and how to confirm that the website was not used as a source.

- [ ] **Step 4: Review the decision record**

Run: `rg -n "website|XLSX|source of truth|rollback|public fields|academic_year" docs/architecture docs/runbooks`

Expected: every global constraint is represented in at least one decision, contract, or runbook statement.

- [ ] **Step 5: Commit**

```bash
git add docs/architecture docs/runbooks
git commit -m "docs: define directory architecture and data contract"
```

## Task 1: Scaffold the application and test harness

**Files:**
- Create: `apps/directory-web/package.json`
- Create: `apps/directory-web/src/lib/config.ts`
- Create: `apps/directory-web/src/lib/errors.ts`
- Create: `apps/directory-web/tests/smoke/config.test.ts`
- Create: `packages/domain/src/index.ts`
- Create: `packages/domain/src/types.ts`
- Create: `packages/domain/tests/types.test.ts`
- Modify: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`

**Interfaces:**
- Consumes: Task 0 data-contract decisions.
- Produces: shared TypeScript domain types, configuration validation, typed error codes, and runnable unit-test/lint commands.

- [ ] **Step 1: Write failing type and configuration tests**

Test that required environment values fail fast, that `record_type` accepts only `student` or `staff`, and that public result types cannot contain source trace fields.

- [ ] **Step 2: Run the tests**

Run: `pnpm test -- packages/domain/tests/types.test.ts apps/directory-web/tests/smoke/config.test.ts`

Expected: FAIL because the shared types and config validator do not exist.

- [ ] **Step 3: Implement the shared types and config validator**

Define exact interfaces in `packages/domain/src/types.ts`:

```ts
export type RecordType = "student" | "staff";
export type ImportJobStatus = "uploaded" | "scanning" | "validating" | "rejected" | "ready_for_review" | "publishing" | "indexing" | "published" | "publish_failed" | "rolled_back" | "cancelled";
export type PublicStudent = { publicId: string; recordType: "student"; displayName: string; academicYear: string; grade: string; room: string; status?: string; publishedAt: string };
export type PublicStaff = { publicId: string; recordType: "staff"; displayName: string; category: string; departmentOrSubject?: string; title?: string; status?: string; publishedAt: string };
```

Add runtime environment validation in `apps/directory-web/src/lib/config.ts`; never log secrets.

- [ ] **Step 4: Run tests and static checks**

Run: `pnpm test && pnpm lint && pnpm typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-workspace.yaml tsconfig.base.json apps packages
git commit -m "chore: scaffold directory search workspace"
```

## Task 2: Implement metadata schema, versioning, and access boundaries

**Files:**
- Create: `apps/directory-worker/src/db/migrations/001_directory_metadata.sql`
- Create: `apps/directory-worker/src/db/client.ts`
- Create: `apps/directory-worker/src/repositories/importJobs.ts`
- Create: `apps/directory-worker/src/repositories/datasetVersions.ts`
- Create: `apps/directory-worker/src/repositories/auditEvents.ts`
- Create: `apps/directory-worker/src/auth/roles.ts`
- Test: `apps/directory-worker/tests/repositories/versioning.test.ts`
- Test: `apps/directory-worker/tests/auth/roles.test.ts`

**Interfaces:**
- Consumes: Task 1 domain types and Task 0 data contract.
- Produces: `ImportJobRepository`, `DatasetVersionRepository`, `AuditEventRepository`, and role checks used by import and admin APIs.

- [ ] **Step 1: Write failing repository tests**

Cover creation of an import job, immutable dataset versions, active-version switching, rollback, audit event insertion, and rejection of public-role access to admin operations.

- [ ] **Step 2: Run the tests**

Run: `pnpm test -- apps/directory-worker/tests/repositories/versioning.test.ts apps/directory-worker/tests/auth/roles.test.ts`

Expected: FAIL because migrations and repositories do not exist.

- [ ] **Step 3: Implement the schema and repositories**

Create tables for `source_files`, `import_jobs`, `import_issues`, `dataset_versions`, `audit_events`, and `approved_field_config`. Enforce unique version identifiers, explicit active-version state, and source traceability. Implement:

```ts
createImportJob(input: CreateImportJobInput): Promise<ImportJob>;
recordImportIssue(input: ImportIssueInput): Promise<void>;
createDatasetVersion(input: CreateDatasetVersionInput): Promise<DatasetVersion>;
activateDatasetVersion(versionId: string, actorId: string): Promise<void>;
rollbackDatasetVersion(versionId: string, actorId: string): Promise<void>;
appendAuditEvent(input: AuditEventInput): Promise<void>;
assertRole(actor: Actor, required: "importer" | "publisher" | "operator" | "owner"): void;
```

Make activation transactional so a failed switch leaves the previous active version unchanged.

- [ ] **Step 4: Run tests and migration checks**

Run: `pnpm db:migrate:test && pnpm test -- apps/directory-worker/tests/repositories/versioning.test.ts apps/directory-worker/tests/auth/roles.test.ts`

Expected: PASS, including rollback and unauthorized-action tests.

- [ ] **Step 5: Commit**

```bash
git add apps/directory-worker/src/db apps/directory-worker/src/repositories apps/directory-worker/src/auth apps/directory-worker/tests
 git commit -m "feat: add versioned directory metadata and roles"
```

## Task 3: Build restricted source-file storage and XLSX reader

**Files:**
- Create: `apps/directory-worker/src/storage/privateObjectStore.ts`
- Create: `apps/directory-worker/src/import/xlsxReader.ts`
- Create: `apps/directory-worker/src/import/sourceGuard.ts`
- Test: `apps/directory-worker/tests/import/xlsxReader.test.ts`
- Test: `apps/directory-worker/tests/import/sourceGuard.test.ts`
- Fixtures: `apps/directory-worker/tests/fixtures/xlsx/valid-room-per-sheet.xlsx`
- Fixtures: `apps/directory-worker/tests/fixtures/xlsx/unexpected-sheets.xlsx`
- Fixtures: `apps/directory-worker/tests/fixtures/xlsx/corrupt.xlsx`

**Interfaces:**
- Consumes: approved file uploads and Task 2 repositories.
- Produces:

```ts
export type WorkbookSheet = { name: string; rows: unknown[][] };
export type ReadWorkbookResult = { fileId: string; checksum: string; sheets: WorkbookSheet[] };
readWorkbook(file: UploadedFile): Promise<ReadWorkbookResult>;
assertApprovedXlsxSource(input: { sourceType: string; filename: string; origin?: string }): void;
putPrivateSource(input: PrivateSourceInput): Promise<PrivateSourceRef>;
```

- [ ] **Step 1: Create anonymized workbook fixtures**

Use synthetic names and identifiers only. Include multiple room sheets, an unexpected sheet, blank rows, duplicate identifiers, and a corrupt file.

- [ ] **Step 2: Write failing reader and source-boundary tests**

Assert that valid XLSX files produce sheet/row data and checksum metadata, corrupt files produce a typed error, and website URLs or source types are rejected before parsing.

- [ ] **Step 3: Run tests to verify failure**

Run: `pnpm test -- apps/directory-worker/tests/import/xlsxReader.test.ts apps/directory-worker/tests/import/sourceGuard.test.ts`

Expected: FAIL because the reader and source guard are not implemented.

- [ ] **Step 4: Implement the reader and private storage adapter**

Use a maintained XLSX parser. Keep raw bytes in private object storage. Reject unsupported extensions, oversize files, password-protected files, and all non-approved origins. Never fetch the current website as part of this code path.

- [ ] **Step 5: Run tests and dependency security checks**

Run: `pnpm test -- apps/directory-worker/tests/import/xlsxReader.test.ts apps/directory-worker/tests/import/sourceGuard.test.ts && pnpm audit --prod`

Expected: PASS; no source-boundary regression.

- [ ] **Step 6: Commit**

```bash
git add apps/directory-worker/src/storage apps/directory-worker/src/import apps/directory-worker/tests/fixtures apps/directory-worker/tests/import
 git commit -m "feat: add private XLSX source ingestion"
```

## Task 4: Implement validation, normalization, and import reports

**Files:**
- Create: `apps/directory-worker/src/import/schemaRules.ts`
- Create: `apps/directory-worker/src/import/normalizeStudent.ts`
- Create: `apps/directory-worker/src/import/normalizeStaff.ts`
- Create: `apps/directory-worker/src/import/validateWorkbook.ts`
- Create: `apps/directory-worker/src/import/importReport.ts`
- Test: `apps/directory-worker/tests/import/validateWorkbook.test.ts`
- Test: `apps/directory-worker/tests/import/normalizeRecords.test.ts`
- Test: `apps/directory-worker/tests/import/importReport.test.ts`

**Interfaces:**
- Consumes: `ReadWorkbookResult` from Task 3 and mapping/data-contract configuration from Task 0.
- Produces:

```ts
export type ValidationIssue = { severity: "error" | "warning"; code: string; fileName: string; sheetName?: string; rowNumber?: number; message: string };
export type ValidatedImport = { students: NormalizedStudent[]; staff: NormalizedStaff[]; issues: ValidationIssue[]; blocking: boolean };
validateWorkbook(input: WorkbookInput, config: ImportSchemaConfig): ValidatedImport;
normalizeStudentRow(input: StudentSourceRow, context: SourceContext): NormalizedStudent;
normalizeStaffRow(input: StaffSourceRow, context: SourceContext): NormalizedStaff;
```

- [ ] **Step 1: Write failing validation tests**

Cover required fields, blank names, invalid grades/rooms, duplicates within and across workbooks, unexpected sheets, unsupported academic year, movement-file misuse, and warnings versus blocking errors.

- [ ] **Step 2: Write failing normalization tests**

Assert stable normalized fields, preserved source file/sheet/row trace, normalized whitespace, no accidental loss of Thai characters, and no public exposure of raw source values.

- [ ] **Step 3: Run tests**

Run: `pnpm test -- apps/directory-worker/tests/import/validateWorkbook.test.ts apps/directory-worker/tests/import/normalizeRecords.test.ts`

Expected: FAIL because validation and normalization are not implemented.

- [ ] **Step 4: Implement validation and normalization**

Use versioned schema rules. Treat blocking errors as publication-stopping. Keep source trace fields restricted. Keep student and staff normalizers separate. Do not infer staff records from student workbooks. Treat movement and summary files as separate source types that are rejected by the student-directory importer unless an explicit future rule enables them.

- [ ] **Step 5: Implement safe import reports**

Generate counts for accepted, rejected, and warned rows plus file/sheet/row references. Mask values in administrator previews and omit raw values from unauthenticated responses.

- [ ] **Step 6: Run tests and coverage**

Run: `pnpm test --coverage -- apps/directory-worker/tests/import`

Expected: PASS with coverage thresholds defined by the repository; all review-focus cases are covered.

- [ ] **Step 7: Commit**

```bash
git add apps/directory-worker/src/import apps/directory-worker/tests/import
 git commit -m "feat: validate and normalize XLSX directory records"
```

## Task 5: Implement asynchronous import jobs and publish/rollback workflow

**Files:**
- Create: `apps/directory-worker/src/jobs/processImportJob.ts`
- Create: `apps/directory-worker/src/jobs/publishDataset.ts`
- Create: `apps/directory-worker/src/jobs/rollbackDataset.ts`
- Create: `apps/directory-worker/src/routes/adminImports.ts`
- Create: `apps/directory-worker/src/routes/adminVersions.ts`
- Test: `apps/directory-worker/tests/jobs/importLifecycle.test.ts`
- Test: `apps/directory-worker/tests/jobs/atomicPublish.test.ts`

**Interfaces:**
- Consumes: Tasks 2–4 repositories and import functions.
- Produces:

```ts
processImportJob(jobId: string, actor: Actor): Promise<ImportJob>;
publishDataset(input: PublishDatasetInput): Promise<DatasetVersion>;
rollbackDataset(input: { versionId: string; actor: Actor }): Promise<DatasetVersion>;
```

Admin routes must expose safe job status, preview, report, publish, and rollback operations with role checks.

- [ ] **Step 1: Write failing lifecycle tests**

Test valid upload through `published`, invalid upload through `rejected`, indexing failure through `publish_failed` with the old version still active, and rollback to a prior version.

- [ ] **Step 2: Run tests to verify failure**

Run: `pnpm test -- apps/directory-worker/tests/jobs/importLifecycle.test.ts apps/directory-worker/tests/jobs/atomicPublish.test.ts`

Expected: FAIL because the job processor and publication workflow do not exist.

- [ ] **Step 3: Implement the job processor**

Process files asynchronously, update job status, persist issues, write audit events, and keep the live dataset unchanged until all validation and indexing checks pass. Make retries idempotent by job ID and source checksum.

- [ ] **Step 4: Implement publication and rollback**

Create a new immutable dataset version, build its index records, perform a health check, atomically activate it, and retain the previous active version. On any failure, mark the job/version appropriately and leave the previous version live.

- [ ] **Step 5: Implement admin routes**

Protect upload, preview, publish, rollback, and audit routes. Return stable error codes and no raw stack traces. Do not accept a website URL as a source input.

- [ ] **Step 6: Run integration tests**

Run: `pnpm test -- apps/directory-worker/tests/jobs && pnpm test:integration -- import-lifecycle`

Expected: PASS, including failure injection and rollback.

- [ ] **Step 7: Commit**

```bash
git add apps/directory-worker/src/jobs apps/directory-worker/src/routes apps/directory-worker/tests/jobs
 git commit -m "feat: add versioned import publication workflow"
```

## Task 6: Implement the search index adapter and query service

**Files:**
- Create: `apps/directory-worker/src/search/searchIndex.ts`
- Create: `apps/directory-worker/src/search/normalizeQuery.ts`
- Create: `apps/directory-web/src/server/searchService.ts`
- Create: `apps/directory-web/src/server/resultPolicy.ts`
- Create: `apps/directory-web/src/app/api/search/route.ts`
- Create: `apps/directory-web/src/app/api/directory/meta/route.ts`
- Test: `apps/directory-web/tests/search/searchService.test.ts`
- Test: `apps/directory-web/tests/search/resultPolicy.test.ts`
- Test: `apps/directory-web/tests/search/searchRoute.test.ts`

**Interfaces:**
- Consumes: active `DatasetVersion` records and Task 1 public result types.
- Produces:

```ts
export type SearchFilters = { recordType?: "student" | "staff" | "all"; academicYear?: string; grade?: string; room?: string; category?: string; departmentOrSubject?: string; status?: string };
export type SearchRequest = { query: string; filters: SearchFilters; pageSize: number; cursor?: string };
export type SearchResponse = { items: Array<PublicStudent | PublicStaff>; nextCursor?: string; total?: number; datasetVersion: string; publishedAt: string };
searchDirectory(request: SearchRequest): Promise<SearchResponse>;
filterPublicResult(record: NormalizedStudent | NormalizedStaff, policy: PublicFieldPolicy): PublicStudent | PublicStaff;
```

- [ ] **Step 1: Write failing search tests**

Cover Thai partial names, Latin text, exact identifier policy, combined grade/room filters, staff category filters, duplicate-name ordering, stable pagination, empty-query limits, and field allowlisting.

- [ ] **Step 2: Run tests**

Run: `pnpm test -- apps/directory-web/tests/search`

Expected: FAIL because the index adapter and service do not exist.

- [ ] **Step 3: Implement query normalization and index adapter**

Normalize whitespace and Unicode safely. Store searchable fields separately from public display fields. Use indexed queries and a stable tie-breaker. Keep the adapter behind `SearchIndex` so the underlying search implementation can change after Thai-search benchmarks.

- [ ] **Step 4: Implement result policy**

Apply approved field configuration, generic no-result behavior, status masking, publication timestamp, and dataset version metadata. Ensure source file, sheet, row, raw identifier, and private fields cannot appear in public responses.

- [ ] **Step 5: Implement search routes**

Validate query length, filter values, cursor, and page size. Enforce maximum result limits, rate-limit hooks, and safe errors. Do not allow empty-query full-dataset export.

- [ ] **Step 6: Run unit, integration, and latency tests**

Run: `pnpm test -- apps/directory-web/tests/search && pnpm test:integration -- search && pnpm bench:search -- --dataset=pilot`

Expected: PASS; p95 latency meets the target recorded in Task 0 or the decision record documents the measured gap.

- [ ] **Step 7: Commit**

```bash
git add apps/directory-worker/src/search apps/directory-web/src/server apps/directory-web/src/app/api apps/directory-web/tests/search
 git commit -m "feat: add privacy-filtered global directory search"
```

## Task 7: Build the public Thai-first search UI

**Files:**
- Create: `apps/directory-web/src/app/directory/page.tsx`
- Create: `apps/directory-web/src/components/directory/SearchTabs.tsx`
- Create: `apps/directory-web/src/components/directory/SearchBox.tsx`
- Create: `apps/directory-web/src/components/directory/FilterControls.tsx`
- Create: `apps/directory-web/src/components/directory/ResultCard.tsx`
- Create: `apps/directory-web/src/components/directory/ResultGrid.tsx`
- Create: `apps/directory-web/src/components/directory/FreshnessNotice.tsx`
- Create: `apps/directory-web/src/components/directory/EmptyState.tsx`
- Create: `apps/directory-web/src/styles/tokens.css`
- Test: `apps/directory-web/tests/ui/directoryPage.test.tsx`
- Test: `apps/directory-web/tests/ui/directoryAccessibility.test.tsx`

**Interfaces:**
- Consumes: Task 6 `SearchResponse`, metadata route, and design tokens from the attached design system.
- Produces: public route `/directory` with accessible tabs, search, filters, result cards, freshness state, and responsive behavior.

- [ ] **Step 1: Write failing component and accessibility tests**

Test tab selection, keyboard search submission, filter removal, result rendering, no-result state, stale-data notice, semantic headings/labels, focus visibility hooks, and result-type distinction.

- [ ] **Step 2: Run tests**

Run: `pnpm test -- apps/directory-web/tests/ui/directoryPage.test.tsx apps/directory-web/tests/ui/directoryAccessibility.test.tsx`

Expected: FAIL because the page and components do not exist.

- [ ] **Step 3: Implement the page flow**

Implement Students / Staff / All tabs, wide search input, lightweight popular links, responsive filter controls, result cards, pagination or load-more, detail navigation, and safe empty/error states. Keep query and filter state shareable only if the privacy review approves URL query parameters.

- [ ] **Step 4: Apply the design system**

Use the white canvas, near-black ink, muted metadata, charcoal pill actions, pink active/focus accents, soft blush freshness notice, hairline borders, rounded cards, 4px/8px spacing rhythm, and no gradients/glass effects. Use Thai-first copy and approved English labels.

- [ ] **Step 5: Add responsive and motion safeguards**

Collapse the hero on small screens, keep search full width, allow horizontal tab scrolling, preserve 44px touch targets, and respect reduced-motion preferences.

- [ ] **Step 6: Run browser and accessibility tests**

Run: `pnpm test -- apps/directory-web/tests/ui && pnpm test:e2e -- directory && pnpm test:a11y -- directory`

Expected: PASS at desktop and mobile viewports with no critical accessibility issues.

- [ ] **Step 7: Commit**

```bash
git add apps/directory-web/src/app/directory apps/directory-web/src/components/directory apps/directory-web/src/styles apps/directory-web/tests/ui
 git commit -m "feat: add Thai-first global directory interface"
```

## Task 8: Build the protected admin import interface

**Files:**
- Create: `apps/directory-web/src/app/admin/imports/page.tsx`
- Create: `apps/directory-web/src/app/admin/imports/[jobId]/page.tsx`
- Create: `apps/directory-web/src/components/admin/FileDropzone.tsx`
- Create: `apps/directory-web/src/components/admin/ValidationSummary.tsx`
- Create: `apps/directory-web/src/components/admin/MaskedPreview.tsx`
- Create: `apps/directory-web/src/components/admin/PublishControls.tsx`
- Create: `apps/directory-web/src/app/admin/versions/page.tsx`
- Test: `apps/directory-web/tests/admin/importWorkflow.test.tsx`
- Test: `apps/directory-web/tests/admin/adminAccess.test.tsx`

**Interfaces:**
- Consumes: Task 5 admin routes, Task 2 role checks, and Task 4 import report types.
- Produces: authenticated upload, progress, validation, preview, publish, version history, and rollback UI.

- [ ] **Step 1: Write failing admin UI tests**

Test role-based access, upload progress, invalid-file messaging, masked preview, publish confirmation, current-live-version display, and rollback confirmation.

- [ ] **Step 2: Run tests**

Run: `pnpm test -- apps/directory-web/tests/admin`

Expected: FAIL because the admin pages and components do not exist.

- [ ] **Step 3: Implement protected admin routes**

Require authenticated roles. Never render raw source rows in a public route. Keep publication and rollback actions explicit and auditable.

- [ ] **Step 4: Implement import job UX**

Show states uploaded, validating, rejected, ready for review, publishing, published, and failed. Provide row-level file/sheet/row references for authorized users without exposing raw values unnecessarily.

- [ ] **Step 5: Implement version and rollback UX**

Show active version, prior versions, academic year, publish timestamp, source-file names, counts, warnings, and rollback action. Require a confirmation that explains the effect.

- [ ] **Step 6: Run end-to-end admin tests**

Run: `pnpm test:e2e -- admin-import && pnpm test:a11y -- admin`

Expected: PASS with unauthorized users blocked and authorized workflows auditable.

- [ ] **Step 7: Commit**

```bash
git add apps/directory-web/src/app/admin apps/directory-web/src/components/admin apps/directory-web/tests/admin
 git commit -m "feat: add protected import and version admin screens"
```

## Task 9: Add monitoring, audit, rate limits, and operational safeguards

**Files:**
- Create: `apps/directory-worker/src/observability/metrics.ts`
- Create: `apps/directory-worker/src/observability/alerts.ts`
- Create: `apps/directory-web/src/server/rateLimit.ts`
- Create: `apps/directory-web/src/app/admin/operations/page.tsx`
- Create: `docs/runbooks/incident-response.md`
- Create: `docs/runbooks/data-freshness.md`
- Test: `apps/directory-worker/tests/observability/metrics.test.ts`
- Test: `apps/directory-web/tests/security/rateLimit.test.ts`

**Interfaces:**
- Consumes: import/job/search events from Tasks 5–8.
- Produces: metrics, alerts, protected operations view, rate-limit behavior, freshness runbook, and incident-response steps.

- [ ] **Step 1: Write failing monitoring and abuse tests**

Cover stale dataset detection, failed-import alerting, repeated publication failure, search rate limits, oversized page requests, and audit-event completeness.

- [ ] **Step 2: Run tests**

Run: `pnpm test -- apps/directory-worker/tests/observability apps/directory-web/tests/security/rateLimit.test.ts`

Expected: FAIL because monitoring and rate limits do not exist.

- [ ] **Step 3: Implement metrics and alerts**

Emit import counts, validation issue counts, publication latency, rollback events, search latency, search errors, rate-limit events, freshness age, and index health. Avoid logging raw search terms by default.

- [ ] **Step 4: Implement rate limits and enumeration controls**

Limit request frequency, page size, query length, and repeated identifier probing. Return stable safe errors. Keep limits configurable and documented.

- [ ] **Step 5: Implement operations view and runbooks**

Show live version, freshness, failed jobs, index status, recent audit events, and rollback readiness. Document stale-data response, failed-import response, suspected exposure response, and restore procedures.

- [ ] **Step 6: Run security and operational checks**

Run: `pnpm test -- apps/directory-worker/tests/observability apps/directory-web/tests/security && pnpm test:e2e -- operations`

Expected: PASS; alerts and limits behave as documented.

- [ ] **Step 7: Commit**

```bash
git add apps/directory-worker/src/observability apps/directory-web/src/server/rateLimit.ts apps/directory-web/src/app/admin/operations docs/runbooks apps/directory-worker/tests/observability apps/directory-web/tests/security
 git commit -m "feat: add directory monitoring and abuse controls"
```

## Task 10: Complete privacy, accessibility, data-quality, and release validation

**Files:**
- Create: `tests/fixtures/approved/anonymized-directory-fixture.json`
- Create: `tests/acceptance/xlsx-only-source.acceptance.ts`
- Create: `tests/acceptance/public-field-policy.acceptance.ts`
- Create: `tests/acceptance/atomic-publication.acceptance.ts`
- Create: `docs/release/checklist.md`
- Modify: `docs/architecture/data-contract.md`, `docs/runbooks/import-publish.md`

**Interfaces:**
- Consumes: all implemented components and the approved school decisions from Task 0.
- Produces: release evidence, benchmark results, privacy/accessibility sign-off checklist, and a production import runbook.

- [ ] **Step 1: Build anonymized acceptance fixtures**

Create synthetic Thai names, duplicate names, multiple grades/rooms, staff categories, invalid rows, and multiple academic years. Do not place production personal information in the repository.

- [ ] **Step 2: Write acceptance tests**

Assert: website source import is impossible; every published student record has XLSX traceability; blocking errors do not publish; failed indexing preserves the old live version; public responses omit restricted fields; empty queries cannot enumerate the dataset; and rollback restores the prior version.

- [ ] **Step 3: Run the complete test suite**

Run: `pnpm test && pnpm test:integration && pnpm test:e2e && pnpm test:a11y && pnpm lint && pnpm typecheck`

Expected: PASS with no critical security, privacy, accessibility, or source-of-truth failures.

- [ ] **Step 4: Run the search benchmark**

Run: `pnpm bench:search -- --dataset=approved-anonymized-fixture`

Expected: p95 search latency is <= 500 ms or the documented decision record contains the approved revised target and mitigation.

- [ ] **Step 5: Run a pilot import**

Use school-approved representative workbooks in a restricted environment. Compare file/sheet coverage, row counts, accepted/rejected/warned counts, and known test searches. Do not publish until the school data administrator signs off.

- [ ] **Step 6: Complete manual reviews**

Verify keyboard-only flow, Thai text rendering, mobile filters, focus states, privacy notice, no-result behavior, admin authorization, raw-file access boundaries, rollback, and website compatibility links.

- [ ] **Step 7: Finalize release evidence and commit**

```bash
git add tests docs/release docs/architecture/data-contract.md docs/runbooks/import-publish.md
git commit -m "chore: complete directory search release validation"
```

---

## Self-review coverage

- **PRD problem and source-of-truth rule:** Tasks 0, 3, 5, and 10 enforce that only approved XLSX files produce student records.
- **Room-per-sheet parsing and data quality:** Tasks 3 and 4 cover workbook reading, schema validation, normalization, duplicate detection, and source traceability.
- **Versioned publication and rollback:** Tasks 2 and 5 define transactional activation, failure preservation, and rollback tests.
- **Public search and filters:** Task 6 defines the service contract and tests; Task 7 implements the UI and accessibility behavior.
- **Staff search:** Tasks 0, 4, 5, and 6 keep staff input separate and support approved staff categories.
- **Privacy and abuse controls:** Tasks 2, 6, 8, 9, and 10 cover roles, field allowlists, rate limits, audit, and enumeration tests.
- **Architecture diagram:** Tasks 2–9 map directly to the import, storage, index, public search, result policy, and monitoring nodes.
- **Design system:** Task 7 applies the attached Dribbble-inspired system to the public search experience; Task 8 adapts it for admin workflows.
- **Open decisions:** Task 0 records unresolved school decisions before implementation begins rather than hiding them in code.

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-11-11-phichai-global-directory-search.md`. Please review the plan. Which execution approach would you prefer?

- **Subagent-driven:** a fresh worker implements each task and a reviewer checks it before the next task; most thorough, but slower.
- **Native:** I implement the tasks in this session and run one final review; faster and simpler, but with less independent review.

I recommend **subagent-driven** because this plan spans import parsing, versioned data publication, public search, admin UX, privacy controls, and operations; independent checks reduce the risk of a source-of-truth or privacy regression.
