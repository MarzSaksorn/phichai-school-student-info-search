# Production Monitoring and Error Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add production-safe health checks, structured request/error telemetry, operational metrics, and alert evaluation for the Vercel/Supabase directory system.

**Architecture:** Keep telemetry provider-neutral and server-only. Vercel receives structured JSON logs for immediate diagnosis, while a private Supabase `directory.observability_events` table retains bounded, privacy-safe events for operations views and alert evaluation. Public health responses expose only availability, freshness, and generic status; protected operations responses expose aggregate metrics and sanitized recent failures.

**Tech Stack:** TypeScript, Vercel serverless functions, Supabase service-role client, Vitest, PostgreSQL RLS.

**Spec:** `Phichai School Global Directory Search Implementation Plan.md`, Global Constraints and Task 9 monitoring requirements.

## Global Constraints

- Do not log raw search terms, student names, identifiers, source paths, XLSX values, bearer tokens, or stack traces in client responses.
- Raw XLSX files, row-level errors, source locations, and audit traces remain restricted to authorized administrators.
- Failed imports and failed publication must not alter the current active dataset.
- Public health checks must not disclose database credentials, table names, or internal exception details.
- Monitoring must not send student data to third-party analytics, advertising, search, AI, or error-tracking services.
- Alert thresholds must be explicit, configurable, and documented.

## Review Focus

- Telemetry failure must never break the user request or expose internal details.
- Public health must remain useful without revealing private schema or student information.
- Search telemetry must record timing and outcome without recording query text.
- Stale datasets and repeated publication failures must produce deterministic alert states.
- Operations responses must be role-protected and aggregate-only.

## Task 12: Production monitoring and error tracking

**Files:**
- Create: `apps/directory-worker/src/db/migrations/006_observability_events.sql`
- Create: `api/_lib/telemetry.ts`
- Create: `api/_lib/health.ts`
- Create: `api/health.ts`
- Create: `api/admin/operations.ts`
- Create: `apps/directory-worker/src/observability/alerts.ts`
- Create: `api/tests/monitoringContracts.test.ts`
- Create: `apps/directory-worker/tests/observability/alerts.test.ts`
- Modify: `api/search.ts`, `api/admin/imports.ts`, `api/admin/imports/[jobId].ts`, `docs/runbooks/ci-cd.md`

**Interfaces:**
- `recordTelemetry(event: TelemetryEventInput): Promise<void>` never throws and emits a structured server log plus a private Supabase event.
- `getPublicHealth(): Promise<PublicHealth>` returns `healthy | degraded` with no private diagnostics.
- `getOperationsSnapshot(): Promise<OperationsSnapshot>` returns aggregate health, freshness, latency, error, rate-limit, and failed-job metrics.
- `evaluateAlerts(snapshot: AlertSnapshot, now?: Date): Alert[]` deterministically evaluates stale data, publication failures, search error rate, and latency thresholds.

- [ ] **Step 1: Write failing alert and API contract tests**

Cover stale freshness, repeated publish failures, error-rate and p95 thresholds, public-safe health fields, protected operations routes, and absence of query/student/source values from telemetry code.

- [ ] **Step 2: Add private observability storage**

Create `directory.observability_events` with bounded event names, severity, request route, status, duration, error code, safe JSON metadata, and timestamps. Revoke Data API access and enable RLS.

- [ ] **Step 3: Implement telemetry and alert evaluation**

Implement structured logging plus best-effort Supabase persistence. Normalize metadata to primitive aggregate values. Add explicit thresholds: freshness warning at 24 hours, critical at 72 hours; publication failure alert at 2 failures in 15 minutes; search error alert at 5% over 15 minutes; p95 latency alert above 500 ms over 15 minutes.

- [ ] **Step 4: Add health and operations endpoints**

Add public `GET /api/health` and protected operator/owner `GET /api/admin/operations`. Return generic public failures and aggregate operations data only.

- [ ] **Step 5: Instrument request paths**

Instrument public search and admin upload/status paths with request IDs, durations, status codes, safe error codes, and rate-limit counters. Ensure telemetry failures are swallowed.

- [ ] **Step 6: Verify, migrate, and document**

Run the complete repository verification, apply migration 006 to Supabase, and document Vercel health checks, alert thresholds, incident triage, and retention expectations.

- [ ] **Step 7: Commit**

```bash
git add api apps/directory-worker/src/db/migrations/006_observability_events.sql apps/directory-worker/tests/observability docs/runbooks docs/superpowers/plans
 git commit -m "feat: add production monitoring and error tracking"
```
