# CI/CD runbook

## Verification

Every pull request and every push to `main` runs `.github/workflows/ci.yml`. The workflow installs from the committed `pnpm-lock.yaml`, runs the full unit/integration suite, runs the dedicated E2E suite, performs TypeScript checks, builds the static web artifact, and runs the production dependency audit. A failed verification blocks the branch from being considered deployable.

The local equivalent is `pnpm verify`. The web build writes only to `apps/directory-web/dist`, which is ignored and must not be committed.

## Vercel deployment

### Import directly from GitHub

In Vercel, choose **Add New → Project**, import `MarzSaksorn/phichai-school-student-info-search`, and keep the repository root as the Root Directory. The committed root `vercel.json` supplies the remaining settings: Corepack-pinned pnpm `10.15.0` frozen-lockfile installation, `corepack pnpm@10.15.0 build:web`, and `apps/directory-web/dist` as the output directory. No framework preset or manual build command is required. Every push to `main` can then trigger a deployment from the connected GitHub repository.

If you prefer Vercel's monorepo project view, set Root Directory to `apps/directory-web` instead. The app-level `apps/directory-web/vercel.json` provides the equivalent build contract.

`.github/workflows/deploy-vercel.yml` deploys a preview for pull requests and production for pushes to `main`. Deployment jobs are intentionally skipped when any required secret is absent. Configure these repository or environment secrets in GitHub:

- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`

The workflow never stores these values in source, logs them, or passes them as URL parameters. Production deployment uses the protected `production` environment so approval rules can be enabled in GitHub.

The current Vercel deployment publishes the public UI and protected admin UI as static artifacts. The browser-facing search and admin API adapters still need to be connected before production data operations work; the UI displays safe unavailable/error states until those endpoints are deployed. Supabase runtime credentials are not required during the static build and must be configured only as runtime deployment secrets when the server-backed application is connected.

## Rollback

If production verification or monitoring identifies a bad deployment, use Vercel's deployment history to promote the last known-good deployment, then revert or fix the corresponding commit on `main`. Do not force-push. If the defect affects directory data rather than code, use the dataset rollback workflow and preserve the audit trail.
