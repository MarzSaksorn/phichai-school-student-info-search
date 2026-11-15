# ADR 0002: Reviewed staff web snapshot publication

- **Status:** Review ingestion and authorized publication enabled by default
- **Date:** 2026-11-15
- **Decision owners:** School data owner, authorized publisher, and implementation team

## Context

The project has a separate staff record model, but the school has not provided a staff XLSX export. The public staff page at `https://main.phichai.ac.th/school-staff` visibly contains staff display names, categories or roles, and some academic-rank text. The approved source policy allows reviewed website-derived staff records with an explicit publisher confirmation.

## Decision

Implement a **review-only parser** for an operator-provided HTML snapshot. The parser accepts only the exact staff-page URL as source metadata, recognizes the current staff-card shape under schema `staff-web-card-v2`, normalizes the approved display fields, records restricted source traceability, and returns a validation report. After an authorized publisher confirms the review, only `displayName`, `category`, `title`, and `department` are copied into the public staff index; raw snapshots and source traceability remain private.

The upload workflow does not fetch the website or schedule a crawler. It writes the operator-provided snapshot and restricted review records to private Supabase storage and tables, and an authorized publisher can atomically activate the reviewed staff publication version. `STAFF_SNAPSHOT_IMPORT_ENABLED=false` is the emergency off switch; import is enabled when the variable is unset.

The initial public fields were `displayName`, `category`, and optional `title`. On 2026-11-15, the requester approved adding public teaching department/subject to this software's allowlist. Any required school/data-owner policy review remains a prerequisite before production promotion. The parser reads only `Teach_major` from the card's structured detail payload, with the enclosing learning-area tab label as fallback; it does not retain image URLs, biography text, arbitrary card HTML, or other payload values. Duplicate display names remain separate records and create a warning for operator review.

## Approval required before production use

The school owner approved the source page and the initial public fields: displayName, category, and title. The requester subsequently approved department as an additional field in this implementation on 2026-11-15; do not treat this as a substitute for any separate school/data-owner review required before production promotion. Each snapshot still requires an authorized publisher confirmation. Refresh cadence, removal handling, privacy notice, and raw-snapshot retention remain operational responsibilities.

## Consequences

This keeps the student XLSX boundary unchanged and gives the team a deterministic way to review staff snapshots without introducing an always-on synchronization job. The parser depends on the school page’s current HTML card classes, so a page redesign must fail closed and produce an empty or invalid review rather than silently importing a different page structure. The staff approval endpoint is enabled by default and has an explicit STAFF_SNAPSHOT_APPROVAL_ENABLED=false emergency kill switch. Each new staff publication supersedes the prior active staff publication while retaining the previous rows for rollback tooling.
