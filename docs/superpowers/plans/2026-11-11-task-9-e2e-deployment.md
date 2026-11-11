# Task 9 E2E and Deployment Pipeline Implementation Plan

> **For agentic workers:** Implement natively in this session, task-by-task, with tests before implementation.

**Goal:** Prove the public directory lifecycle end to end and automate repeatable checks plus guarded Vercel deployments from GitHub.

**Architecture:** Add a framework-neutral integration harness that composes the existing in-memory directory store, publication workflow, search index, rate limiter, and search route. Add a GitHub Actions workflow that runs the repository’s pinned pnpm checks on pull requests and pushes, then performs Vercel preview/production deployment only when the relevant repository secrets are configured. Keep deployment credentials out of source and make missing deployment secrets an explicit skipped deployment rather than a false success.

**Tech Stack:** TypeScript, Vitest, pnpm 11, GitHub Actions, Vercel CLI, Supabase migrations already tracked in the repository.

**Spec:** `Phichai School Global Directory Search Implementation Plan.md`, Task 9 and the existing Tasks 4–8 contracts.

## Global Constraints

- Public responses must never expose source filenames, sheets, rows, student identifiers, raw query text, IP addresses, or private audit details.
- The public search route must retain rate limiting, bounded page size, cursor validation, and safe error codes.
- Dataset publication remains atomic: failed indexing must not replace the prior active dataset.
- CI must run from the repository root with the committed pnpm lockfile and must not require production secrets for ordinary validation.
- Deployment secrets must be supplied only through GitHub Actions secrets; no credentials may be committed.
- Supabase remains the metadata/database system and Vercel remains the web deployment target.

## Review Focus

- A published dataset must be searchable through the public route, including Thai partial-name matching and public-field filtering.
- A failed publication/indexing attempt must preserve the previously active dataset.
- Rate limits must be enforced in the integrated route and emit privacy-safe audit events.
- Cursor pagination must work across multiple requests without leaking private fields.
- CI must fail on tests, type errors, or dependency vulnerabilities, while deployment remains safely gated by configured secrets.

### Task 1: End-to-end directory lifecycle harness

**Files:**
- Create: `apps/directory-web/tests/e2e/directoryLifecycle.test.ts`
- Create: `apps/directory-web/tests/e2e/deploymentContracts.test.ts`
- Create: `apps/directory-web/src/server/e2eHarness.ts`

**Interfaces:**
- Produces `createDirectoryE2EHarness()` with `publish`, `search`, and `store` handles for integration tests.
- Consumes existing `publishDataset`, `createSearchRoute`, `InMemorySearchIndex`, and `InMemoryRateLimiter` contracts.

- [x] Write failing lifecycle tests for publish → search → pagination → rate-limit audit behavior.
- [x] Run the E2E tests and verify they fail before the harness exists.
- [x] Implement the harness with synthetic records only and deterministic timestamps/IDs.
- [x] Run the E2E tests, full tests, lint, and typecheck.
- [x] Commit the integration harness as one logical change.

### Task 2: Deployment contract and CI workflow

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `.github/workflows/deploy-vercel.yml`
- Create: `apps/directory-web/vercel.json`
- Modify: `package.json`
- Create: `docs/runbooks/ci-cd.md`
- Test: `apps/directory-web/tests/e2e/deploymentContracts.test.ts`

**Interfaces:**
- Root scripts: `test:e2e`, `verify`, and `build:web`.
- CI runs install, tests, E2E tests, typecheck, and production audit on pull requests and pushes to `main`.
- Deployment workflow uses `VERCEL_TOKEN`, `VERCEL_ORG_ID`, and `VERCEL_PROJECT_ID`; it deploys preview on pull requests and production on `main`, with a guarded skip when secrets are absent.

- [x] Write failing contract tests for scripts, workflow triggers, secret names, and Vercel config.
- [x] Implement scripts, Vercel configuration, CI, deployment workflow, and runbook.
- [x] Run contract tests and all repository checks.
- [x] Inspect the staged diff for secrets and run `git diff --check`.
- [ ] Commit and push the complete Task 9 pipeline.
