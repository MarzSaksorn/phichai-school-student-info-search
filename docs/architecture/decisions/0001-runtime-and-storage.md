# ADR 0001: Runtime, Storage, and Publication Boundaries

- **Status:** Accepted for pilot implementation
- **Date:** 2026-11-11
- **Decision owners:** Project implementation team; school data and website administrators must approve the policy inputs before production publication
- **Scope:** Phichai School Global Directory Search, version 1

## Context

The directory has two distinct lanes:

1. A protected administrator lane that accepts approved XLSX exports, validates and normalizes them, and publishes immutable dataset versions.
2. A public search lane that reads only the currently active, privacy-filtered dataset.

Approved XLSX exports are the sole source of truth for student records. The existing school website is a compatibility and navigation reference only. It must not be scraped, imported, synchronized, or used to overwrite XLSX-derived records.

A failed or invalid import must never change the current live dataset. Publication therefore needs a versioned build step followed by an atomic active-version switch.

## Decisions

### 1. Repository and application layout

Use a TypeScript monorepo managed by `pnpm`:

```text
apps/
  directory-web/       # Next.js public search and authenticated admin UI/API routes
  directory-worker/    # import, validation, normalization, indexing, and publication jobs
packages/
  domain/              # shared contracts with no database, filesystem, or framework dependency
docs/
  architecture/       # ADRs and data contract
  runbooks/            # operational procedures
tests/                # anonymized acceptance fixtures and cross-app tests
```

The public web app and worker share domain types but do not share raw-source access. Import logic remains in the worker boundary.

### 2. Runtime and deployment

- **Public/admin web:** Next.js with TypeScript, deployed to Vercel. Vercel handles the public search route, authenticated admin UI, API routes, and metadata endpoints.
- **Database and auth:** Supabase provides the managed PostgreSQL database, Supabase Auth integration, and database migrations. Row Level Security is enabled on every exposed table; privileged import operations use a server-only connection and never expose a service-role key to browser code.
- **Private storage:** Supabase Storage provides private buckets for raw XLSX files, reports, and masked previews. Storage policies are restricted to authenticated administrator roles; public search has no raw-object access.
- **Background work:** a separately runnable TypeScript worker process consumes durable Supabase import-job records. The worker must be safe to retry by `job_id` and source checksum. If hosted on Vercel, long-running work is dispatched to a queue/worker-compatible runtime rather than performed inside a request that can time out.
- **Local development:** Supabase CLI/local stack is the preferred local database, Auth, and Storage environment. A local filesystem adapter is allowed only for tests and must preserve the same private-storage interface.
- **Test environment:** isolated Supabase/PostgreSQL project or schema and disposable private Storage namespace. Fixtures use synthetic data only.

The exact hosting vendor, production region, and identity-provider tenant are deployment inputs and are not encoded as application defaults.

### 3. Relational metadata and normalized record storage

Use Supabase Postgres as the system of record for:

- source-file metadata and checksums;
- import jobs and row-level validation issues;
- immutable dataset-version metadata;
- normalized records and restricted source traceability;
- approved public-field configuration;
- audit events.

The first search adapter uses PostgreSQL indexed normalized fields and `pg_trgm` where available. The search adapter is an interface so a dedicated Thai-capable search engine can be evaluated later without changing the public search contract.

All tables in the exposed `public` schema have RLS enabled. Public search reads only a deliberately exposed, privacy-filtered query surface; raw source tables and trace fields remain in a private schema or are protected from `anon` and `authenticated` access. Views that are exposed to clients use an RLS-compatible design and do not bypass policy accidentally.

Database ownership is split by responsibility:

- `packages/domain` owns TypeScript contracts only.
- `apps/directory-worker` owns migrations and repositories for import, versioning, records, and audit data.
- `apps/directory-web` may read through service interfaces but must not issue unrestricted raw-source queries.

### 4. Private object storage

Raw XLSX files and restricted import reports are stored in private Supabase Storage buckets. Production paths are separated by data class:

```text
raw-xlsx/{academic_year}/{job_id}/{file_id}.xlsx
import-reports/{academic_year}/{job_id}/report.json
previews/{academic_year}/{job_id}/masked-preview.json
```

Objects are never publicly readable and are never returned directly from public routes. Access is through short-lived, authorized administrator operations where the school approves download capability. Object keys, source filenames, sheet names, and row locations are restricted audit data.

Bucket names, retention duration, encryption implementation, and region are environment/configuration values. No secret, service-role key, or production bucket name is committed to the repository.

### 5. Source boundary

The student-directory importer accepts only an uploaded XLSX byte stream explicitly labeled as an approved XLSX source. It rejects website URLs, website source types, remote fetch instructions, movement files, summaries, unsupported extensions, and unsupported origins before workbook parsing.

There is no website-sync job. A website link may be stored as compatibility metadata or documentation, but never as an import input.

Staff records use a separate approved source type and normalizer. Student workbooks never infer or generate staff records.

### 6. Publication and search availability

A publication creates an immutable `dataset_version`, builds and health-checks its search records, then atomically changes the single active-version pointer in a database transaction. Public queries resolve only through that active pointer.

If validation, indexing, health checks, or activation fail, the previous active version remains unchanged. Rollback activates a retained prior immutable version and appends an audit event; it does not delete history or re-import source files.

The pilot target is successful publish-to-search availability within 15 minutes and public search p95 latency of 500 ms or less for the agreed pilot dataset. Measurements and any approved target changes belong in release evidence.

### 7. Administrator authentication and roles

Use Supabase Auth with the school's approved OIDC-compatible identity provider when available. Authorization data belongs in server-controlled app metadata or a protected role table, never user-editable `user_metadata`. Local development uses clearly marked test identities and synthetic accounts only.

Minimum roles:

- `importer`: upload files and inspect safe validation results;
- `publisher`: review and publish a valid dataset;
- `operator`: inspect health, audit, and rollback operations;
- `owner`: manage roles and approved public-field configuration.

The school may combine roles operationally, but authorization checks remain distinct in code. Public requests have no administrator role and cannot access raw files, reports, traces, or publication controls.

### 8. Configuration and unresolved policy inputs

These values must be provided through reviewed configuration or an approved data-contract record, not hidden defaults:

- academic-year format and active-year policy;
- grade mapping, including any M.1–M.6 to grade 7–12 mapping;
- accepted workbook schema and column mappings;
- approved public fields and identifier search/display policy;
- staff source and approved staff categories;
- active/inactive, movement, transfer, and withdrawal handling;
- freshness warning and critical thresholds;
- raw-file, report, old-version, and audit retention;
- administrator role assignments and identity-provider details;
- production hosting, storage, backup, and alerting destinations.

Until approved, the implementation must fail closed or keep the value unavailable rather than guessing.

## Consequences

Positive consequences:

- Source-of-truth enforcement is explicit and testable.
- Public search can remain online while imports validate or fail.
- PostgreSQL provides transactional metadata and a practical initial Thai-search benchmark path.
- Storage and identity providers can change behind interfaces.
- Restricted traces remain available for authorized audit without entering public responses.

Trade-offs:

- A worker and durable job state add operational complexity compared with synchronous upload parsing.
- PostgreSQL search quality for Thai text must be benchmarked before committing to a dedicated search engine.
- Production launch cannot proceed until the school resolves the configuration inputs listed above.

## Verification

Before Task 1 is considered complete, review this ADR against the PRD and architecture artifact. The following must be true:

- No decision permits website-derived student records.
- Failed validation or indexing preserves the active version.
- Raw XLSX, row issues, and source traces are restricted.
- Public responses are shaped by an approved allowlist.
- Academic year, public fields, retention, and roles are explicit inputs.
