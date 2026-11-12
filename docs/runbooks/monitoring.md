# Production monitoring and error tracking runbook

## What is monitored

The Vercel functions emit structured JSON records with the `phichai_telemetry` type. Each record contains only a route, request identifier, status code, duration, safe error code, severity, and bounded aggregate metadata. Search text, student names, identifiers, source filenames, storage paths, bearer tokens, and stack traces are intentionally excluded.

The same records are retained in the private `directory.observability_events` Supabase table. The table is server-only: `anon` and `authenticated` have no table privileges and no RLS policies are created. Vercel logs remain the first-line debugging source; Supabase telemetry supports the protected operations view and short-window alert evaluation.

## Endpoints and probes

Configure the Vercel deployment platform to probe `GET /api/health` every 60 seconds. HTTP 200 means the active dataset is present and fresher than 24 hours. HTTP 503 means the system is degraded because the active dataset is missing, stale, or the server cannot verify it. The public response contains only `healthy | degraded`, check time, and freshness state; it does not expose database errors or schema details.

Operators use `GET /api/admin/operations` with a Supabase Auth bearer token. Only `operator` and `owner` roles may access it. The response contains aggregate 15-minute counts for search requests, search errors, p95 latency, publication failures, rejected imports, and evaluated alerts. It never returns telemetry rows, query text, source details, or student records.

## Alert thresholds

| Alert | Condition | Severity | First response |
|---|---|---:|---|
| Dataset stale | Active dataset is at least 24 hours old | Warning | Confirm the expected school upload schedule and inspect the latest import job. |
| Dataset critically stale | Active dataset is at least 72 hours old or missing | Critical | Contact the data administrator, verify Supabase availability, and do not manually publish an unreviewed file. |
| Publication failures | At least 2 publication failures in 15 minutes | Critical | Inspect the job status and Vercel logs; preserve the current active version while diagnosing. |
| Search error rate | At least 5% search failures in 15 minutes with traffic | Critical | Check Vercel function errors, Supabase connectivity, and recent deployment history. |
| Search latency | p95 exceeds 500 ms in 15 minutes | Warning | Inspect query mix, active-version indexes, and database advisors before changing limits. |

The thresholds are implemented in `apps/directory-worker/src/observability/alerts.ts`. Alert evaluation is deterministic and uses only bounded aggregate inputs.

## Incident procedures

For a stale-data alert, confirm whether a school-approved XLSX is expected, then inspect the latest import status. If the import is invalid, leave the current active dataset unchanged and request a corrected export. If publication failed, preserve the previous active version, inspect the failure code, and retry only after the source and schema are verified.

For suspected privacy exposure, immediately pause public deployment promotion, preserve relevant Vercel request IDs and timestamps, and inspect only the protected logs. Do not copy student values into tickets or chat. Rotate exposed credentials if a token or service key may have appeared, then use the dataset rollback workflow if the published data itself is incorrect.

For an availability incident, first check `/api/health`, then Vercel deployment history and Supabase project status. Promote the last known-good Vercel deployment for code regressions. For data regressions, roll back the dataset version rather than force-pushing or deleting audit history.

## Retention and maintenance

Keep observability events bounded to operational telemetry and apply the school's approved retention period before enabling any scheduled deletion. Until that policy is approved, do not delete audit events or raw source records as part of routine monitoring. Review unused-index advisories after real traffic has exercised the new queries; an unused-index notice immediately after migration is expected.
