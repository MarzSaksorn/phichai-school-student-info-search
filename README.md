# Phichai School Global Directory Search

Thai-first global student and staff directory search for Phichai School.

## Current baseline

- **Web and admin UI:** Next.js / TypeScript on Vercel
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
