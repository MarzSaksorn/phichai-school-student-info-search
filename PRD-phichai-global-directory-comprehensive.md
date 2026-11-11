# Product Requirements Document: Phichai School Global Directory Search

**Status:** Draft for implementation planning  
**Version:** 1.0  
**Author:** Manus AI  
**Product owner:** Phichai School data and website administrators  
**Primary language:** Thai, with English UI labels where approved translations exist  
**Related architecture:** [Interactive XLSX import and global search architecture](/home/ubuntu/phichai-flowchart/phichai-xlsx-search-architecture.html)

---

## 1. Executive Summary

### Problem statement

Phichai School users cannot search all students or staff from one reliable place. The current student page requires grade-and-room selection and its displayed student data is not accurate. The staff page separates people into role and subject tabs, so a user cannot perform one global lookup. [1] [2]

### Proposed solution

Build a public global directory search backed by approved XLSX exports and a controlled publishing pipeline. The approved XLSX files are the sole source of truth for student records. The current website student directory must not be scraped, imported, synchronized, or used to overwrite XLSX-derived data.

The system will accept room-per-sheet XLSX workbooks, validate them, normalize rows into a common record shape, store raw files privately, publish a versioned dataset, index only approved public fields, and serve deterministic search results through a public search page. Staff records will enter through a separate approved source because student workbooks cannot provide a complete staff directory.

### Success criteria

The following are proposed targets for the first production release. The school should confirm or revise them during discovery.

1. **Coverage:** 100% of approved student records for the agreed grades and academic year are present in the published dataset, with an import report showing source coverage by file and room.
2. **Search performance:** p95 search response time is at or below 500 ms for the expected published dataset and common filter combinations.
3. **Search usability:** at least 90% of pilot users find a known person and correctly understand the result’s grade/room or staff category without assistance.
4. **Import freshness:** a successful publish makes the new dataset searchable within 15 minutes.
5. **Data integrity:** zero public records are ingested from the current website student directory; every published student record is traceable to an approved XLSX file, sheet, and row.
6. **Accessibility:** the public search page meets WCAG 2.2 AA checks for keyboard navigation, focus visibility, labels, color contrast, responsive layout, and screen-reader structure.

---

## 2. Product scope and principles

### Product principles

- **XLSX first:** approved XLSX exports are the only student-data source of truth.
- **Website is not a data source:** the current website is used only for navigation, compatibility links, and reference to existing checksheet workflows.
- **Publish, do not edit:** administrators publish new versions from source files; public users cannot edit records.
- **Privacy by default:** store and expose only fields that the school approves for publication.
- **Explain freshness:** every public result set identifies the academic year and last-published time.
- **Fail closed:** blocking validation errors prevent publication and leave the current live dataset unchanged.
- **Deterministic search:** use indexed text matching and explicit filters, not AI-generated identity matching.
- **Progressive disclosure:** show a sparse global overview, then let users narrow results with tabs, search, and filters.

### In scope for version 1

- Global student search across the approved grade range and academic year.
- Global staff search across an approved staff source.
- Thai-first partial text search with support for Latin text where available.
- Filters for record type, academic year, grade, room, staff category, department/subject, and approved status fields.
- XLSX upload, validation, normalization, preview, publication, version history, and rollback.
- Restricted storage of original workbooks and import reports.
- Search index containing only approved normalized fields.
- Public responsive search UI and result details.
- Import and search audit events, freshness indicators, failure monitoring, and operational reporting.
- Compatibility links to existing room-specific and checksheet workflows.

### Non-goals for version 1

- Scraping or synchronizing student records from the current website.
- Replacing the school’s source-of-truth administration or student information system.
- Editing student or staff records from the public interface.
- Publishing raw XLSX files or unrestricted bulk personal-data exports.
- AI-based matching, facial recognition, fuzzy identity resolution, or automatic merging of people with similar names.
- A full attendance, timetable, grading, or student-support system.
- Public access to fields that the school has not explicitly approved.
- Automatic ingestion from Google Drive unless the school later approves a secure connector and scheduling policy.

---

## 3. Users and user stories

### Persona A: Parent, student, or visitor

This user wants to find a student or staff member by name, student number, grade, room, or category. They may use a mobile phone, search in Thai, and need enough context to distinguish people with similar names.

**User stories and acceptance criteria**

**A1. Search globally**

> As a visitor, I want to search Students, Staff, or All from one page so that I do not have to open every room or staff category.

- The page offers Students, Staff, and All tabs.
- A query can be submitted by keyboard and touch.
- Partial Thai text returns matching approved records.
- Latin text is supported for fields that contain Latin text.
- Empty queries do not trigger an unrestricted personal-data dump; the page shows a helpful prompt or requires a filter.
- Results are paginated or incrementally loaded with a visible result count where safe.

**A2. Narrow results**

> As a teacher, I want to filter by grade and room so that I can find the right class without scanning unrelated results.

- Filters can be combined.
- The selected filters are visible and removable.
- Grade and room values come from the published dataset, not hard-coded website values.
- The filter state is usable on mobile through a popover or bottom sheet.

**A3. Distinguish people**

> As a user, I want to see a person’s approved context so that I can distinguish duplicate names.

- Student results show approved name fields and grade/room context.
- Staff results show approved name fields and category or department context.
- Student and staff records have distinct result-type labels.
- The page does not reveal unapproved personal identifiers.

**A4. Understand freshness**

> As a parent, I want to know when the directory was updated so that I can judge whether the result is current.

- The page shows academic year and last-published time.
- A stale-data notice appears when the configured freshness threshold is exceeded.
- The page links to the school’s privacy notice.

### Persona B: School data administrator

This user owns source exports and must publish updates safely without exposing raw files or manually editing hundreds of records.

**B1. Upload source files**

> As a data administrator, I want to upload approved XLSX files so that the system can prepare a new directory version.

- The upload flow accepts one or more files in a single import job.
- Each file is associated with an academic year and source type.
- The system records uploader, file name, file size, checksum, upload time, and job ID.
- Student files are explicitly marked as XLSX source-of-truth inputs.
- Website URLs cannot be selected as an import source.

**B2. Validate and preview**

> As a data administrator, I want to see validation results before publishing so that bad rows do not reach users.

- Validation checks file type, workbook readability, sheet structure, required fields, blank names, invalid grade/room values, duplicate identifiers, unsupported academic year, and unexpected sheets.
- Blocking errors stop publication.
- Non-blocking warnings are shown with counts and row-level source locations.
- The preview shows normalized records with sensitive fields masked or omitted.
- The administrator can cancel an invalid job without changing the live dataset.

**B3. Publish and rollback**

> As a data administrator, I want to publish a validated version and roll back if a problem is found so that the public directory remains trustworthy.

- Publication requires an explicit confirmation.
- The system creates an immutable dataset version and records the source files.
- The previous live version remains available for rollback.
- Rollback restores the previous searchable version without deleting audit history.
- Users see the new academic year and publication timestamp after the index is ready.

**B4. Diagnose imports**

> As a data administrator, I want an import report so that I can correct the source workbook rather than guessing what failed.

- The report includes accepted, rejected, and warned row counts.
- Each rejected row includes file, sheet, row number, error code, and safe explanation.
- The report never exposes raw student data in an unauthenticated URL.
- The report can be downloaded by authorized administrators if the school approves that capability.

### Persona C: Website administrator or operator

This user integrates the search page, manages access, monitors freshness, and handles incidents.

**C1. Monitor health**

> As an operator, I want to see failed imports, stale datasets, and search errors so that I can respond before users lose trust.

- The operator can see current live version, last successful publish, last failed job, and freshness status.
- Failed jobs do not replace the live dataset.
- Search error rates and p95 response time are observable.
- Alerts are generated for repeated failed imports, stale data, and index publication failures.

---

## 4. Functional requirements

### 4.1 Public search experience

**FR-1: Entry point.** Add a clearly labeled link such as **ค้นหานักเรียนและบุคลากร** from the school website without changing the current source website’s student records.

**FR-2: Search modes.** Support Students, Staff, and All modes. The default mode should be selected by product testing; All is a reasonable initial default if privacy review permits it.

**FR-3: Query behavior.** Support partial matching against approved searchable name fields and approved identifiers. Normalize common whitespace differences and Unicode composition. Do not silently normalize away meaningful Thai characters.

**FR-4: Filters.** Support record type, academic year, grade, room, staff category, department/subject, and approved active/inactive status. Do not expose a filter that is not represented in the published dataset.

**FR-5: Result ordering.** Define and test deterministic ordering. Recommended order: exact normalized name match, exact approved identifier match, prefix match, then other partial matches; within the same rank, sort by record type and name. Do not claim relevance quality until benchmarked.

**FR-6: Pagination.** Use cursor or page-based pagination with a maximum page size. The public API must not return the full student dataset in one response.

**FR-7: Result card.** Display only approved fields: name, record type, grade/room or department/category, and freshness context. Profile images are optional and require separate approval.

**FR-8: Detail view.** A result detail view may show additional approved fields, but it must not expose raw workbook links, hidden source row data, or private identifiers.

**FR-9: Empty and error states.** Provide helpful states for no query, no results, too many results, unavailable search, and stale data. Do not reveal sensitive enrollment information through overly specific no-result messages unless approved.

**FR-10: Compatibility.** Preserve links to the current room-specific/checksheet workflow during migration. The compatibility link must be visually and verbally distinct from the new XLSX-backed global search.

### 4.2 XLSX import and publishing

**FR-11: Source-of-truth enforcement.** The import system must accept student records only from approved XLSX uploads or a future explicitly approved equivalent. It must reject website URLs and must not include a website-sync job.

**FR-12: Workbook support.** Support the observed room-per-sheet workbook pattern, including multiple worksheets representing rooms. The parser must not depend only on one fixed sheet name; it must validate and map the known structure.

**FR-13: Column mapping.** Define a versioned import schema and mapping configuration. The system may support administrator-confirmed mappings for source variations, but mappings must be saved with the import job and reviewed before publication.

**FR-14: Validation.** Validate file extension and content, workbook readability, expected sheet structure, required fields, grade/room values, duplicate identifiers, blank names, invalid data types, academic year, and source completeness.

**FR-15: Normalization.** Convert valid rows into a common record shape with source type, academic year, grade, room, approved identity fields, staff category/department where applicable, active status where approved, source file ID, source sheet, source row, and dataset version.

**FR-16: Preview.** Show counts and a masked sample of normalized records. Preview data must be available only to authorized administrators.

**FR-17: Publication gate.** Require explicit administrator confirmation. Publication is atomic from the user’s point of view: the old live dataset remains active until the new version is validated, indexed, and marked ready.

**FR-18: Rollback.** Keep at least the previous successful version and restore it without re-importing source files. Retention duration is a school policy decision.

**FR-19: Source traceability.** Every published student record must be traceable to its approved XLSX source file, worksheet, and row. Traceability is for authorized audit users and must not be public by default.

**FR-20: Movement files and summaries.** Treat movement/transfer files and student-count summaries as separate source types. They must not silently mutate the live student directory. If used, their behavior must be defined in a separate approved rule set.

### 4.3 Staff data

**FR-21: Approved staff source.** Accept staff records from an approved staff export or controlled administrator input. Student workbooks alone are insufficient.

**FR-22: Staff categories.** Support the school’s approved categories, including executives, subject groups, student-development activities, officers, and employees, subject to the final staff data contract.

**FR-23: Staff publication.** Apply the same validation, versioning, privacy, and rollback principles to staff records.

### 4.4 Administration and audit

**FR-24: Roles.** At minimum, support administrator/operator access separate from public access. The school must define whether upload, approve, publish, rollback, and audit permissions are separate roles.

**FR-25: Audit events.** Record login, upload, validation, preview, publish, rollback, deletion, and permission changes with actor, time, job/version ID, and outcome.

**FR-26: Freshness.** Compute freshness from the active dataset’s publication time and academic year. Configure warning and critical thresholds.

**FR-27: Operational status.** Provide a protected view of import jobs, live version, index status, error counts, and recent audit events.

---

## 5. Data contract

The final field list requires school approval. The following is a proposed minimum contract.

### 5.1 Student record

| Field | Required | Public by default | Notes |
|---|---:|---:|---|
| `record_type` | Yes | Yes | Always `student` |
| `academic_year` | Yes | Yes | Source year, normalized format |
| `grade` | Yes | Yes | Confirm mapping from M.1–M.6 to grades 7–12 |
| `room` | Yes | Yes | Normalized room label |
| `display_name` | Yes | Yes | School-approved display form |
| `search_name` | Yes | No | Normalized search value |
| `student_identifier` | Policy | Policy | May require masking, login, or no public display |
| `status` | Policy | Policy | Active, moved, withdrawn, or other approved values |
| `source_file_id` | Yes | No | Audit trace only |
| `source_sheet` | Yes | No | Audit trace only |
| `source_row` | Yes | No | Audit trace only |
| `dataset_version` | Yes | No | Publication trace |

### 5.2 Staff record

| Field | Required | Public by default | Notes |
|---|---:|---:|---|
| `record_type` | Yes | Yes | Always `staff` |
| `display_name` | Yes | Yes | School-approved display form |
| `search_name` | Yes | No | Normalized search value |
| `category` | Yes | Yes | Executive, subject, officer, etc. |
| `department_or_subject` | Policy | Yes | Only if approved |
| `title` | Policy | Yes | Position or role |
| `contact_fields` | No | No | Excluded unless separately approved |
| `status` | Policy | Policy | Active/inactive if approved |
| `source_file_id` | Yes | No | Audit trace only |
| `dataset_version` | Yes | No | Publication trace |

### 5.3 Source and version records

Each import job should retain file metadata, checksum, uploader, upload time, academic year, source type, parser/mapping version, validation summary, publication decision, and links to the resulting dataset version. Raw source content and row-level error details must be restricted.

---

## 6. Technical specifications

### 6.1 Architecture overview

The system is split into an administrator import lane and a public search lane.

1. **Approved XLSX exports** enter a protected admin import workflow. These files are the only student source of truth.
2. **Validation** checks workbook structure, sheets, required values, duplicates, grade/room metadata, and academic year.
3. **Rejected imports** stop without changing the live dataset. The administrator receives a safe error report.
4. **Normalization** flattens room worksheets into consistent student and staff records.
5. **Restricted raw storage** retains source files and import reports for audit and controlled reprocessing.
6. **Publish dataset** creates a versioned, immutable release after administrator confirmation. The previous live version remains available for rollback.
7. **Search index** contains only approved normalized fields and filter metadata. It must never receive records from the inaccurate website student directory.
8. **Public search UI** sends query text and filters to the search service.
9. **Search service** performs deterministic indexed matching, filtering, pagination, limits, and response shaping.
10. **Result policy** applies public-field and privacy rules before returning data.
11. **Search results** show approved person context, academic year, and freshness information.
12. **Audit and monitoring** track imports, publication, rollback, freshness, search errors, and operational health.

See the [interactive architecture diagram](/home/ubuntu/phichai-flowchart/phichai-xlsx-search-architecture.html) for the component relationships and drilldowns.

### 6.2 Suggested components

The exact stack is TBD and must be chosen with the school’s hosting and maintenance constraints in mind.

- **Public web client:** responsive Thai-first page with search tabs, query input, filters, cards, detail view, privacy notice, and accessibility support.
- **Admin web client:** authenticated upload, mapping confirmation, preview, validation report, publish, rollback, and audit views.
- **Search service:** query validation, indexed lookup, filters, pagination, rate limits, and safe response shaping.
- **Import worker:** asynchronous XLSX parsing, schema validation, normalization, and error reporting.
- **Relational metadata store:** users, jobs, source files, dataset versions, audit events, and approved field configuration.
- **Search index:** current and optionally previous published records, with aliases or version switching for atomic publication.
- **Restricted object storage:** raw XLSX files, import reports, and optionally generated previews.
- **Observability:** structured logs, metrics, health checks, alerting, and operational dashboards.

### 6.3 Import job state machine

`uploaded -> scanning -> validating -> invalid` or `ready_for_review -> publishing -> indexing -> published`.

Failure states must be explicit:

- `rejected`: blocking data or schema errors; no live dataset change.
- `publish_failed`: validation passed but publication or indexing failed; previous version remains live.
- `rolled_back`: a prior version was restored after publication.
- `cancelled`: administrator stopped the job before publication.

### 6.4 Search service behavior

The public search service must:

- Reject unsupported query parameters and excessive page sizes.
- Apply record-type and metadata filters before returning records.
- Use a stable sort order for repeatable pages.
- Return a dataset version or publication timestamp for cache and freshness handling.
- Prevent unrestricted enumeration through empty queries, sequential identifiers, or oversized limits.
- Avoid logging raw personal search terms unless necessary for security or product measurement; if logged, apply retention and access controls.
- Return a generic safe no-result response unless the school approves more specific disclosure.

### 6.5 Integration points

- **School website:** link or embed the public search page; no student-data synchronization.
- **Approved file source:** manual XLSX upload in version 1; optional future Google Drive connector only after security and ownership approval.
- **Identity provider:** admin authentication through the school’s approved account system, if available.
- **Object storage:** private source and report storage.
- **Search/index store:** versioned published records.
- **Monitoring/notification:** school-approved email or dashboard alerts for failed jobs and stale data.

### 6.6 API outline

The following endpoints are implementation guidance, not a final contract.

**Public**

- `GET /api/search?q=&type=&academic_year=&grade=&room=&category=&page=` — returns paginated approved results.
- `GET /api/directory/meta` — returns available academic years, grades, rooms, categories, and current freshness metadata; exclude values the user is not allowed to see.
- `GET /api/records/{public_id}` — returns one approved public record if detail views are enabled.

**Admin**

- `POST /api/admin/imports` — creates an import job and uploads approved source files.
- `GET /api/admin/imports/{job_id}` — returns job state and safe validation summary.
- `GET /api/admin/imports/{job_id}/report` — returns an authorized detailed report.
- `POST /api/admin/imports/{job_id}/preview` — generates a masked preview.
- `POST /api/admin/imports/{job_id}/publish` — confirms publication after validation.
- `POST /api/admin/versions/{version_id}/rollback` — restores a previous version.
- `GET /api/admin/audit` — returns authorized audit events.

API responses must use consistent error codes, avoid raw stack traces, and distinguish validation errors from infrastructure failures.

---

## 7. Security, privacy, and compliance

### 7.1 Data handling rules

- Treat student and staff data as personal information.
- Keep raw XLSX files private and encrypted in storage where supported.
- Store only the minimum approved fields in the public index.
- Separate public records, restricted audit traces, and raw source files.
- Mask or omit student identifiers unless the school explicitly approves public display.
- Do not send student data to third-party search, analytics, advertising, or AI services.
- Define retention and deletion periods for raw files, reports, old versions, and audit logs.
- Keep a record of the school’s approved publication field list and effective date.

### 7.2 Access control

At minimum, require authenticated administrator access for upload, preview, publish, rollback, and audit. Use least privilege. Recommended roles are:

- **Importer:** uploads files and views validation results.
- **Publisher:** reviews and publishes a valid dataset.
- **Operator:** views health, audit, and rollback controls.
- **Owner:** manages roles and approved field configuration.

The school may combine roles for a small team, but publication should still require deliberate confirmation and be auditable.

### 7.3 Abuse prevention

- Rate-limit public search requests.
- Cap page sizes and prevent unrestricted full-dataset enumeration.
- Add bot and abuse monitoring appropriate to the public site.
- Do not expose raw source filenames or row numbers publicly.
- Use generic no-result behavior where revealing non-enrollment would be sensitive.
- Review whether public student search should require login or return reduced fields.

### 7.4 Compliance review

Before public launch, the school must approve the field list, purpose of processing, user access model, privacy notice, retention policy, data-subject request process, and incident response. The product should support the school’s PDPA review rather than claim legal compliance automatically. The existing website already presents a privacy notice referencing PDPA. [1]

---

## 8. Design and accessibility requirements

Use the attached Dribbble-inspired design system as the visual source of truth for the public and admin surfaces, adapted for a trustworthy school directory.

### Visual language

- White canvas `#FFFFFF`.
- Near-black ink `#17151F` for headings and primary labels.
- Muted ink `#6F6B78` for metadata.
- Charcoal `#191720` for primary pill actions with white text.
- Pink `#EA4C89` for active tabs, search icons, emphasis, and focus treatment.
- Acid lime `#D8F05A` only for selective frames or confirmation accents.
- Soft blush `#FFF3F8` for freshness notices and light section breaks.
- Hairline gray `#E9E7EC` for inputs and dividers.

Use Mona Sans or a similar contemporary sans where licensing and Thai glyph support permit. Provide an appropriate Thai fallback. Use a 4px/8px spacing rhythm, 12–18px rounded cards, 12–16px input corners, and 999px pill buttons. Avoid gradients, glass effects, neon glows, and heavy dashboard chrome.

### Accessibility requirements

- Keyboard access to tabs, search, filters, pagination, result cards, and admin actions.
- Visible focus indicator that does not rely on color alone.
- Semantic headings, labels, landmarks, and live result-count announcements where appropriate.
- Touch targets of at least 44px for primary controls.
- Text contrast of at least 4.5:1 for normal text, 3:1 for large text, and 3:1 for meaningful interactive boundaries.
- No information conveyed only through pink, lime, icons, or position.
- Responsive layout that collapses the hero and keeps search available on small screens.
- Reduced-motion support for transitions and loading states.
- Clear error messages associated with the relevant field or import step.

---

## 9. Non-functional requirements

### Performance

- p95 public search response: <= 500 ms under the agreed pilot load.
- Initial page usable state: target <= 2.5 seconds on a representative mobile connection, subject to hosting baseline.
- Successful publish-to-search availability: <= 15 minutes.
- Import processing time: define a target after measuring representative grade files; import work should be asynchronous so the admin page does not block.

### Availability and resilience

- Search remains available while a new import is validating or indexing.
- A failed import never removes the last valid dataset.
- Publication is atomic; users see either the old version or the new version, not a partial mix.
- Back up metadata, versions, and audit logs according to school policy.

### Observability

Track import job counts, validation failure counts by error code, accepted/rejected/warned rows, publication latency, rollback events, query latency, error rates, rate-limit events, stale-data age, and index health. Do not collect more personal search telemetry than needed.

### Maintainability

- Version the parser and mapping configuration.
- Keep source-to-record traceability.
- Add fixtures for representative workbooks and malformed workbooks.
- Document the approved data contract and publication runbook.
- Keep public UI and import logic independent so website redesigns do not change the source-of-truth rule.

---

## 10. Testing and evaluation

### Import tests

- Valid workbook with expected room worksheets.
- Multiple grade files in one job.
- Blank required values.
- Duplicate identifiers within and across files.
- Invalid grade, room, year, or type values.
- Unexpected sheet names and extra sheets.
- Corrupt, password-protected, or non-XLSX files.
- Mixed student and staff source files.
- Movement/transfer files supplied accidentally to the student directory import.
- Rollback after a bad but technically valid publication.
- Verification that website URLs cannot be imported.

### Search tests

- Thai exact and partial name queries.
- Latin text queries where source data contains Latin text.
- Identifier lookup subject to privacy rules.
- Duplicate names with grade/room or department disambiguation.
- Combined filters and pagination stability.
- Empty query protection and maximum-result limits.
- No-result privacy behavior.
- Stale-data warning behavior.
- Public response-field allowlist.

### Data-quality evaluation

Create a benchmark from school-approved test records, not production personal data in an uncontrolled environment. Measure:

- Record coverage by source file and room.
- False omission rate for known approved records.
- Duplicate rate after normalization.
- Field mapping accuracy.
- Search success rate for representative tasks.
- Exact-match and top-result accuracy for known names and identifiers.

The system must not claim a relevance score or precision target until the school supplies an approved benchmark set.

### Security and accessibility tests

- Role and permission tests for every admin action.
- Object-storage access tests.
- Rate-limit and enumeration tests.
- Audit-event completeness tests.
- Keyboard-only and screen-reader smoke tests.
- Automated contrast and semantic checks plus manual review.
- Mobile viewport tests for Thai text, filters, cards, and touch targets.

### Acceptance gate

Release is blocked if any of the following is true:

- Student records came from the website instead of approved XLSX files.
- A blocking validation error can reach the live index.
- A failed publication removes or partially replaces the previous live dataset.
- Raw XLSX files or unapproved fields are publicly accessible.
- A public query can trivially enumerate the full student dataset.
- Critical keyboard, privacy, or contrast issues remain unresolved.

---

## 11. Delivery plan and rollout

### Phase 0: Data and policy discovery

Confirm the grade mapping, complete file set for grades 7–12, staff source, public field list, academic-year naming, status rules, retention, privacy behavior, administrator roles, and representative test fixtures. Produce a signed data contract before production ingestion.

### Phase 1: Import foundation

Implement private file storage, upload jobs, workbook parsing, schema/mapping configuration, validation, normalized records, safe error reports, and raw-source traceability. Test against representative student workbooks and malformed fixtures.

### Phase 2: Versioned publication and search service

Implement dataset versions, atomic publication, rollback, indexed lookup, filters, pagination, safe response shaping, freshness metadata, and monitoring.

### Phase 3: Public and admin experiences

Build the Thai-first public page and protected admin screens using the attached design system. Complete accessibility, privacy, and responsive testing.

### Phase 4: Pilot

Run a limited pilot with school administrators and selected teachers. Compare known approved test cases against published results. Measure search completion, response times, import accuracy, and support questions. Do not expose production student data beyond the approved pilot scope.

### Phase 5: Production launch

Publish the first approved version, link the new page from the school website, retain current room-specific workflows, monitor freshness and errors, and establish a regular import runbook.

### Later versions

Potential later work includes a secure scheduled Drive connector, saved searches, approved reports, directory embeds, richer transliteration, authenticated views, and separate workflows for movement/transfer data. Each item requires a new privacy and source-of-truth review.

---

## 12. Risks, dependencies, and open questions

### Key risks

- **Incomplete source coverage:** requested grades 7–12 may not map directly to the currently visible M.1–M.6 files. Mitigation: require a file manifest and coverage report before publication.
- **Inconsistent workbook layouts:** different grades or years may change sheet names or columns. Mitigation: versioned mappings, validation fixtures, and preview before publish.
- **Missing staff source:** student exports do not provide a complete teacher directory. Mitigation: make staff import a separate dependency and do not infer staff records from student files.
- **Privacy overexposure:** student identifiers or enrollment status could be disclosed. Mitigation: approved field allowlist, privacy review, response limits, generic no-result behavior, and access controls.
- **Stale data:** manual upload schedules may be missed. Mitigation: freshness thresholds, visible timestamp, operator alerts, and a documented import owner.
- **Partial publication:** indexing failures could produce inconsistent results. Mitigation: versioned aliases, atomic switch, health check before activation, and rollback.
- **Name ambiguity:** duplicate Thai names can cause mistaken identity. Mitigation: show grade/room or department context and avoid AI identity matching.
- **Website confusion:** users may continue to trust the inaccurate page. Mitigation: clear global-search entry point, compatibility labeling, and no synchronization from the website.

### Dependencies

- Complete approved XLSX files for the required grades and academic year.
- Approved staff export or staff source.
- School-approved public field list and privacy behavior.
- Hosting, storage, authentication, and monitoring decisions.
- School administrator available for validation and publication approval.
- Representative anonymized or controlled test fixtures.

### Open questions requiring school decisions

1. Which files are authoritative for grades 7–12, and how do M.1–M.6 map to those grades?
2. What is the required academic-year format and active-year behavior?
3. Which student fields may be public? Should student number be hidden, masked, or searchable only after login?
4. Should public users be able to search by student number, or only by name and class context?
5. Is a public no-result response allowed to imply that a student is not enrolled?
6. What staff source will be used, and who approves staff records?
7. Who may upload, approve, publish, rollback, and view audit reports?
8. What are the freshness warning and critical thresholds?
9. How long should raw XLSX files, old dataset versions, import reports, and audit events be retained?
10. Should movement, transfer, withdrawn, and suspended records be excluded, labeled, or handled in a separate authenticated view?
11. Will manual upload be sufficient for version 1, or is a secure Drive connector required at launch?
12. What existing school-site navigation and checksheet links must remain unchanged?

---

## 13. Release acceptance checklist

- [ ] XLSX-only student source-of-truth rule is implemented and tested.
- [ ] Website student directory is not used by any ingestion or synchronization job.
- [ ] Required grade and academic-year file coverage is confirmed.
- [ ] Staff source and approved staff fields are confirmed.
- [ ] Data contract and public-field allowlist are approved.
- [ ] Import validation blocks invalid publication.
- [ ] Normalized records retain restricted source traceability.
- [ ] Raw files and reports are access-controlled.
- [ ] Dataset versions publish atomically and rollback works.
- [ ] Search results are paginated, rate-limited, and privacy-filtered.
- [ ] Freshness and academic-year metadata are visible.
- [ ] Public UI matches the attached design system and works on mobile.
- [ ] WCAG 2.2 AA checks and manual accessibility review pass.
- [ ] Search and import benchmarks meet agreed targets.
- [ ] Monitoring, alerts, runbook, and incident contacts are ready.
- [ ] Pilot users confirm they can find known records and understand context.

---

## References

[1]: https://main.phichai.ac.th/student-list "Phichai School student directory"

[2]: https://main.phichai.ac.th/school-staff?tab=executive "Phichai School staff directory"

[3]: https://drive.google.com/drive/folders/15ZmYcMSm1zcefNowG_aYJ3w5e2doQjz9 "Phichai School academic-year 2569 shared folder"

[4]: /home/ubuntu/upload/DesignSystem_DribbbleHomepage.md "Attached Dribbble-inspired design system"
