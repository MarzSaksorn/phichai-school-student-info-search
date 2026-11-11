# Task 11: Supabase-backed Vercel API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Connect the deployed public and admin UIs to real Vercel server endpoints backed by Supabase while preserving public-field privacy and worker role boundaries.

**Architecture:** Add thin Vercel-compatible request handlers under the repository-root `api/` directory. Public search reads only published records through a server-only Supabase client and returns the existing public result contract. Admin handlers require a Supabase Auth bearer token, derive authorization from `app_metadata`/server-side role records, and call the existing worker workflow/repository boundaries; no service-role credential is sent to the browser.

**Tech Stack:** TypeScript, Vercel Node serverless handlers, `@supabase/supabase-js`, existing domain/worker services, Supabase Postgres and private Storage.

**Spec:** `Phichai School Global Directory Search Implementation Plan.md`, `docs/architecture/data-contract.md`, `docs/runbooks/import-publish.md`.

## Global Constraints

- XLSX is the only accepted student source.
- Public responses must omit identifiers, source traces, raw values, and private metadata.
- Administrative metadata and raw files remain server-only/private.
- Public search requires a query or grade/room narrowing filter and remains rate-limited.
- Admin upload, publish, and rollback require authenticated role checks.
- Supabase service-role credentials must never appear in browser bundles or public responses.
- Every schema change is recorded as a repository migration and verified against the live Supabase project.

## Review Focus

- Missing or malformed environment variables fail closed with structured 500 responses and no secret values.
- Missing, expired, or insufficient bearer tokens return stable 401/403 responses without revealing job or dataset existence.
- Search results never include source paths, identifiers, raw cell values, or service-role data.
- Multipart uploads reject non-XLSX files, oversized files, and unsupported source types before Storage writes.
- Publish/index failures preserve the prior active dataset and return a safe retryable error.

## File Map

- Create `api/_lib/config.ts`: server-only Vercel/Supabase environment loader.
- Create `api/_lib/http.ts`: JSON/problem response helpers, method and bearer parsing.
- Create `api/_lib/supabase.ts`: service-role and user-scoped Supabase clients.
- Create `api/_lib/auth.ts`: bearer validation and role mapping from safe Auth app metadata.
- Create `api/search.ts`: public search endpoint with rate limiting and Supabase query adapter.
- Create `api/admin/imports.ts`: authenticated multipart upload endpoint.
- Create `api/admin/imports/[jobId].ts`: authenticated status endpoint.
- Create `api/admin/imports/[jobId]/publish.ts`: publisher endpoint.
- Create `api/admin/versions/[versionId]/rollback.ts`: operator endpoint.
- Create `apps/directory-worker/src/search/supabaseSearchIndex.ts`: published-record query adapter.
- Create `apps/directory-worker/src/repositories/supabaseStore.ts`: metadata repository adapter used by admin handlers.
- Create `apps/directory-worker/src/db/migrations/004_published_student_records.sql`: normalized published student records with RLS and indexes.
- Create `docs/api/openapi.yaml`: versioned API contract and error catalog.
- Modify `scripts/build-web.mjs`: keep API files outside the static output while preserving `/` and `/admin` artifacts.
- Modify `docs/runbooks/ci-cd.md`: document Vercel environment variables and endpoint readiness.
- Add endpoint and adapter tests under `api/tests/` and worker search tests.

## Implementation Tasks

### Task 1: Live published-record schema

Add the published student record table keyed by immutable dataset version. Store only normalized searchable/public fields plus restricted identifier/search trace columns in the private `directory` schema. Add indexes for active-version filtering, academic-year/grade/room filtering, and Thai search text. Enable RLS and keep anon/authenticated access revoked.

### Task 2: Server configuration and authentication

Load `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and public base URL only in Vercel handlers. Validate HTTPS URL and reject missing values. Validate bearer tokens with `supabase.auth.getUser(token)`, read only `user.app_metadata.role`, and map importer/publisher/operator/owner roles to existing worker actors.

### Task 3: Public search endpoint

Implement `GET /api/search` with query/filter parsing, stable cursor pagination, fixed-window rate limiting, active dataset lookup, published-record search, public result filtering, and safe errors. Keep response fields compatible with the current UI: `items`, `nextCursor`, `datasetVersion`, and `publishedAt`.

### Task 4: Admin upload and lifecycle endpoints

Implement multipart XLSX upload, status, publish, and rollback endpoints. Enforce importer/publisher/operator roles, call existing workflow functions where possible, persist audit events, and return stable JSON errors. Do not expose raw Storage paths or validation row values.

### Task 5: Contract documentation and deployment verification

Add OpenAPI 3.1 documentation, endpoint contract tests, environment-variable runbook changes, and a deployment contract asserting all API handlers are present. Run the full verification suite, Supabase advisors, and a live schema smoke query before committing.
