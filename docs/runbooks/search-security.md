# Search security runbook

## Request limits

The public search route applies a fixed-window limit by default: 60 requests per client key per 60 seconds. It returns HTTP `429`, `{"error":"RATE_LIMITED"}`, and a bounded `Retry-After` header. Page sizes remain capped at 50, query length at 120 characters, and empty-query requests require a grade or room narrowing filter.

The in-memory limiter is suitable for local tests and a single long-lived process. A Vercel or horizontally scaled deployment must inject a shared, atomic limiter implementing the `check(clientKey)` contract. Configure the limit and window from deployment policy; do not silently disable the limiter.

## Client identity

The route accepts an explicit `clientKey` resolver so the deployment can use its trusted edge/runtime client identity. The fallback reads the first value of `X-Forwarded-For`, then `X-Real-IP`, and otherwise uses a bounded anonymous key. Only use forwarded headers when the trusted reverse proxy overwrites them; otherwise provide a resolver based on the platform's verified request identity. Never use the full unbounded forwarded-for list as a key.

## Audit events

Search telemetry is stored in the restricted `directory.audit_events` table. Events are `search_requested`, `search_failed`, and `search_rate_limited`. The actor ID is a short SHA-256 pseudonym of the client key. Safe metadata contains only scalar operational values such as query length, result count, duration, error code, and retry seconds.

Never log or store query text, student identifiers, names, IP addresses, source filenames, source rows, result contents, cursors, cookies, authorization headers, or secrets. The SQL event allowlist is recorded in migration `003_search_audit_events.sql`.

## Incident response

If rate-limit events spike, inspect counts and timestamps without exporting query values. Confirm the active dataset and search index remain healthy, then increase or decrease the shared limiter policy only through a reviewed configuration change. If audit metadata contains a raw query, identifier, IP, or source trace, restrict access to the audit table, preserve the minimum evidence needed for investigation, rotate affected credentials if present, and follow the school's privacy incident process.
