# Phichai School Global Directory Search

Thai-first global student and staff directory search for Phichai School.

## Version 1.1.0 — Responsive layout release

This release makes the public directory and protected admin surface responsive across phones, tablets, laptops, and desktop screens. It adds mobile-first navigation, stacked search actions, adaptive filters and result controls, controlled hero artwork sizing, compact admin metrics, and responsive regression coverage. The release passed the repository verification suite with 38 test files and 123 tests, integration and E2E contracts, accessibility checks, typecheck, the approved anonymized search benchmark, and production dependency audit.

The v1.0.0 directory implementation remains the functional baseline.

This is a code release, not a claim that production data has been imported or published. Vercel deployment, production secrets, school workbook ingestion, dataset publication, and rollback verification remain controlled operational steps requiring the release checklist and explicit authorization.

## Current baseline

- **Public and admin UI:** Static Thai-first HTML/CSS/JavaScript built with Tailwind CSS v4 and daisyUI 5
- **API and hosting:** Vercel serverless functions and static output
- **Database:** Supabase Postgres
- **Authentication:** Supabase Auth with the school-approved OIDC provider when available
- **Private files:** Supabase Storage private buckets
- **Import processing:** retryable TypeScript worker using durable Supabase job records
- **Initial search:** PostgreSQL indexed normalized fields with `pg_trgm` where available

## Non-negotiable source rule

Approved XLSX exports are the sole source of truth for student records. The current school website is a compatibility and navigation reference only; it must not be scraped, imported, synchronized, or used to overwrite XLSX-derived records.

## Project documents

- [Implementation plan](Phichai%20School%20Global%20Directory%20Search%20Implementation%20Plan.md)
- [Product requirements](PRD-phichai-global-directory-comprehensive.md)
- [Runtime and storage ADR](docs/architecture/decisions/0001-runtime-and-storage.md)
- [Data contract](docs/architecture/data-contract.md)
- [Import and publish runbook](docs/runbooks/import-publish.md)
- [Design system](Design%20System_%20Dribbble%20Homepage.md)
- [Architecture diagram](phichai-xlsx-search-architecture.html)

## Before production ingestion

The school must approve the academic-year format, grade mapping, public-field allowlist, identifier policy, staff source, status rules, freshness thresholds, retention periods, and administrator role assignments. See the data contract for the complete decision list.
