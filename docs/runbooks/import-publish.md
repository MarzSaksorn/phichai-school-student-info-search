# Runbook: Import, Review, Publish, and Roll Back the Directory

- **Audience:** school data administrators, publishers, operators
- **Scope:** approved XLSX-backed student directory and separately approved staff source
- **Last reviewed:** 2026-11-12

## Safety rules

- Approved XLSX exports are the sole source of truth for student records.
- Never scrape, copy, synchronize, or import the current school website student directory.
- Website URLs and website-derived records must be rejected before parsing.
- A failed or invalid import must not change the current live dataset.
- Raw XLSX files, row-level issues, source filenames, sheet names, row locations, and audit traces are restricted to authorized administrators.
- Student-number display and approved number-prefix search are enabled only through the versioned school-approved public-field policy.
- Do not place production personal data in development fixtures, tickets, screenshots, or logs.

## Roles

The application enforces separate permissions even if the school assigns multiple roles to one person:

- **Importer:** uploads approved files and inspects validation results.
- **Publisher:** confirms and publishes a valid dataset.
- **Operator:** monitors freshness, publication health, audit events, and rollback readiness.
- **Owner:** manages roles and approved public-field configuration.

At least one authorized publisher must explicitly confirm publication. A failed import does not require rollback because the active dataset must remain unchanged.

## 1. Prepare the source package

1. Obtain the school-approved XLSX export package from the designated data administrator.
2. Confirm the package manifest: academic year, expected grades/rooms, source type, exactly six workbooks (one each for M.1–M.6), and responsible uploader.
3. Confirm student files are marked `approved_student_xlsx`. Staff files must use their separately approved source type.
4. Do not include movement/transfer files or student-count summaries in the student-directory import unless a separately approved rule set exists.
5. Do not provide a website URL, website export, or website-derived spreadsheet as an import source.
6. Keep the original files in the approved restricted channel until the import report and publication decision are complete.

## 2. Upload an import job

1. Sign in through the configured school identity provider.
2. Open the protected import screen.
3. Create one job with the academic year, source type, and approved schema/mapping version.
4. Upload all six grade workbooks together. Each file must be at most 3 MiB and the combined request at most 4 MiB. The system records uploader, filenames, sizes, checksums, upload time, and job ID.
5. Wait for the synchronous validation to finish with status `ready_for_review` or `rejected`.
6. If the system rejects a missing/duplicate grade workbook, year mismatch, website URL, non-XLSX file, unsupported origin, oversized file, corrupt workbook, or unsupported source type, stop and correct the source package. Do not bypass the source guard.

## 3. Review validation

1. Wait for the job to reach `rejected` or `ready_for_review`.
2. For a rejected job, open the restricted report and review each issue by file, sheet, row, code, severity, and safe explanation.
3. Correct the original workbook and create a new import job. Do not edit normalized records manually.
4. For a ready job, review accepted, rejected, and warned row counts; all six files and sheet coverage; student-number completeness and duplicates across files; academic-year checks; expected room coverage; and the masked preview.
5. Confirm that preview values are normalized and masked as designed. Raw rows must not appear in unauthenticated responses.
6. Confirm no student record lacks restricted traceability to source file, sheet, and row.
7. Confirm the proposed public fields match the approved field configuration, including public student-number display and approved number-prefix search.
8. Record any school decision needed for grade mapping, identifier behavior, status handling, or unexpected sheets before publication.

## 4. Publish a valid dataset

1. A publisher reviews the validation report and masked preview.
2. Confirm the academic year, source manifest, row counts, warning count, and expected grade/room coverage.
3. Confirm the import is not derived from the website and contains no website synchronization step.
4. Select **Publish** and explicitly confirm the exact counts, public student-number display, number-prefix search, and that a new immutable dataset version will become live.
5. The system creates the version, builds index records, verifies the six-file manifest and policy, and switches the active-version pointer with the job status in one database transaction.
6. Until that transaction commits, the previous active version remains public.
7. Publication is successful only when the job reaches `published` and the version is marked active.
8. If activation fails, confirm the old version remains active; the inactive candidate is marked `publish_failed` while the reviewed job remains available. Do not retry blindly: inspect the safe error and retry only after an operator confirms the issue is transient or corrected.

## 5. Verify the active version

The publisher or operator verifies all of the following:

- The admin version screen shows the new version as active.
- The public metadata endpoint reports the expected academic year and publication time.
- A Thai partial-name search returns an approved fixture or school-approved pilot record.
- Grade/room and staff-category filters behave as expected.
- Results show only approved public fields (including student number under the active school-approved policy) and no source filenames, sheet names, row numbers, or internal traces.
- Empty-query browsing is supported for the school directory; responses remain paginated and rate-limited, with no unbounded single response.
- A failed or unauthorized admin request returns a safe error and does not expose stack traces.
- Search remains available during future validation and indexing jobs.

Record the version ID, publication timestamp, verification actor, and outcome in the audit trail or release evidence.

## 6. Roll back

Use rollback when a published version is technically valid but the school identifies an approved data-quality or policy problem.

1. Identify the target prior version from the protected version history.
2. Confirm that the target version is immutable, previously validated, and still retained.
3. An operator or owner selects **Rollback** and confirms the exact target version and effect.
4. The system atomically activates the target version without deleting the newer version or audit events.
5. Verify the public metadata and representative searches against the restored version.
6. Record the reason, actor, target version, previous active version, time, and verification outcome.
7. Correct the source workbook and publish a new version only after review; do not patch records directly.

## 7. Incident handling

### Invalid import

Keep the current version active, preserve the rejected job and report for authorized review, correct the source, and create a new job.

### Indexing or publication failure

Confirm the previous version remains active. Capture the job/version ID and safe error. Do not expose raw traces publicly. Retry after diagnosis or escalate to the operator.

### Unexpected public field

Disable or isolate the affected endpoint if necessary, preserve audit evidence, notify the owner/operator, and review the approved field configuration and result-policy tests before reactivation.

### Suspected source-boundary violation

Stop publication. Confirm the source manifest and audit events. Treat any website-derived student record as a release blocker. Remove the affected candidate version from review; never overwrite the active version with it.

### Stale data

Check active-version publication time, import-job history, source availability, and operator alerts. Keep the last known valid dataset available while the next approved import is prepared. Follow the school-approved freshness and privacy notice policy.

## 8. Data retention and deletion

Retention periods for raw files, reports, old versions, and audit events are school decisions and must be configured before production. Deletion requires an authorized operation, an audit event, and confirmation that the retained rollback and compliance requirements remain satisfied.

## Completion checklist

- [ ] Source manifest and academic year confirmed.
- [ ] Source type is approved XLSX or separately approved staff source.
- [ ] Website is not a source and no website-sync job was used.
- [ ] Validation report reviewed.
- [ ] Blocking issues are absent.
- [ ] Masked preview and public-field policy reviewed.
- [ ] Publication explicitly confirmed by an authorized publisher.
- [ ] New version is active only after indexing and health checks pass.
- [ ] Public metadata and representative searches verified.
- [ ] Audit event and release evidence recorded.
- [ ] Automated release validation, accessibility checks, and search benchmark evidence attached to the release.
- [ ] Pilot workbook comparison and school data-administrator sign-off completed before production publication.
