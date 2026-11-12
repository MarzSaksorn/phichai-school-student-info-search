# Search security runbook

## Request limits

The public search route applies a fixed-window limit by default: 60 requests per client key per 60 seconds. It returns HTTP `429`, `{"error":"RATE_LIMITED"}`, and a bounded `Retry-After` header. Page sizes remain capped at 50 and query length at 120 characters. An empty query is a browse request: it returns the published roster one page at a time. A record whose name is a workbook summary note is never served. Student numbers are returned and searchable only when the active dataset's `approved_field_config` authorizes public display and exact matching; digit-only queries never use partial matching. Search queries are not logged, and the internal `studentIdentifier` key and source fields are never returned.

The in-memory limiter is suitable for local tests and a single long-lived process. A Vercel or horizontally scaled deployment must inject a shared, atomic limiter implementing the `check(clientKey)` contract. Configure the limit and window from deployment policy; do not silently disable the limiter.

## Client identity

The route accepts an explicit `clientKey` resolver so the deployment can use its trusted edge/runtime client identity. The fallback reads the first value of `X-Forwarded-For`, then `X-Real-IP`, and otherwise uses a bounded anonymous key. Only use forwarded headers when the trusted reverse proxy overwrites them; otherwise provide a resolver based on the platform's verified request identity. Never use the full unbounded forwarded-for list as a key.

## Audit events

Search telemetry is stored in the restricted `directory.audit_events` table. Events are `search_requested`, `search_failed`, and `search_rate_limited`. The actor ID is a short SHA-256 pseudonym of the client key. Safe metadata contains only scalar operational values such as query length, result count, duration, error code, and retry seconds.

Even though approved student numbers are public response fields, never log or store query text or number values. Also never log names, IP addresses, source filenames, source rows, result contents, cursors, cookies, authorization headers, or secrets. The SQL event allowlist is recorded in migration `003_search_audit_events.sql`.

## Incident response

If rate-limit events spike, inspect counts and timestamps without exporting query values. Confirm the active dataset and search index remain healthy, then increase or decrease the shared limiter policy only through a reviewed configuration change. If audit metadata contains a raw query, identifier, IP, or source trace, restrict access to the audit table, preserve the minimum evidence needed for investigation, rotate affected credentials if present, and follow the school's privacy incident process.
