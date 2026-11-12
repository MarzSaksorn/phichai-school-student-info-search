# CI/CD runbook

## Verification

Every pull request and every push to `main` runs `.github/workflows/ci.yml`. The workflow installs from the committed `pnpm-lock.yaml`, runs the full unit/integration suite, runs the dedicated E2E suite, performs TypeScript checks, builds the static web artifact, and runs the production dependency audit. A failed verification blocks the branch from being considered deployable.

The local equivalent is `pnpm verify`. The web build writes only to `apps/directory-web/dist`, which is ignored and must not be committed.

## Vercel deployment

### Import directly from GitHub

In Vercel, choose **Add New → Project**, import `MarzSaksorn/phichai-school-student-info-search`, and keep the repository root as the Root Directory. The committed root `vercel.json` supplies the remaining settings: Corepack-pinned pnpm `10.15.0` frozen-lockfile installation, `corepack pnpm@10.15.0 build:web`, and `apps/directory-web/dist` as the output directory. No framework preset or manual build command is required. Every push to `main` can then trigger a deployment from the connected GitHub repository.

Keep the Root Directory at the repository root for Task 11. The root `api/` directory contains the Vercel serverless functions; setting Root Directory to `apps/directory-web` would publish the static UI but omit those functions.

`.github/workflows/deploy-vercel.yml` deploys a preview for pull requests and production for pushes to `main`. Deployment jobs are intentionally skipped when any required secret is absent. Configure these repository or environment secrets in GitHub:

- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`

The workflow never stores these values in source, logs them, or passes them as URL parameters. Production deployment uses the protected `production` environment so approval rules can be enabled in GitHub.

Configure these Vercel **Environment Variables** for Preview and Production. Never prefix them with `NEXT_PUBLIC_` or expose them in client code:

- `SUPABASE_URL` — the project HTTPS URL.
- `SUPABASE_SERVICE_ROLE_KEY` — the server-only service-role key. `SUPABASE_KEY` is accepted as a compatibility fallback in the handler, but the explicit service-role name is preferred.

The deployed API surface is `GET /api/search`, `POST /api/admin/imports`, `GET /api/admin/imports/{jobId}`, `POST /api/admin/imports/{jobId}/publish`, and `POST /api/admin/versions/{versionId}/rollback`. Admin endpoints require a Supabase Auth bearer token whose `app_metadata.role` is one of `importer`, `publisher`, `operator`, or `owner`. Public responses follow the active version's approved field configuration: the school-approved policy exposes `studentNumber` and permits exact-number search, while source paths, filenames, sheet/row traces, raw workbook values, and private metadata remain restricted.

Configure an uptime probe for `GET /api/health` every 60 seconds. HTTP 200 means the active dataset is present and fresh; HTTP 503 means the service is degraded or freshness cannot be verified. Configure `GET /api/admin/operations` as a protected operator check, not as a public uptime probe. It reports aggregate 15-minute search, import, publication, latency, and alert metrics.

Structured `phichai_telemetry` records are emitted to Vercel logs and retained in the private Supabase `directory.observability_events` table. The monitoring implementation deliberately excludes search text, student values, identifiers, source paths, tokens, and stack traces. Thresholds and incident procedures are documented in [the monitoring runbook](./monitoring.md).

## Rollback

If production verification or monitoring identifies a bad deployment, use Vercel's deployment history to promote the last known-good deployment, then revert or fix the corresponding commit on `main`. Do not force-push. If the defect affects directory data rather than code, use the dataset rollback workflow and preserve the audit trail.
