# Directory release checklist

## Required automated evidence

- [ ] `pnpm test` passes.
- [ ] `pnpm test:integration` passes.
- [ ] `pnpm test:e2e` passes.
- [ ] `pnpm test:a11y` passes.
- [ ] `pnpm lint` and `pnpm typecheck` pass.
- [ ] `pnpm bench:search -- --dataset=approved-anonymized-fixture` reports p95 search latency at or below 500 ms, or an approved decision record documents the revised target and mitigation.
- [ ] Production dependency audit reports no unresolved high or critical vulnerability.

## Source and data-quality evidence

- [ ] The source manifest identifies only approved XLSX files for student records.
- [ ] Website URLs, website-derived files, and remote origins were rejected.
- [ ] Academic-year, grade, room, duplicate, invalid-row, and unexpected-sheet checks were reviewed.
- [ ] Every published normalized student record has restricted file, sheet, and row traceability.
- [ ] Blocking validation errors prevented publication.
- [ ] The school data administrator signed off accepted, rejected, warned, and expected room counts.

## Privacy and accessibility evidence

- [ ] Public responses contain only the approved field allowlist.
- [ ] Empty and overly broad queries cannot enumerate the dataset.
- [ ] Audit events contain no raw names, identifiers, search terms, IPs, workbook values, or secrets.
- [ ] Keyboard-only navigation, focus visibility, Thai rendering, mobile filters, reduced motion, and no-result messaging were manually reviewed.
- [ ] The privacy notice and website compatibility links were reviewed by the owner.

## Publication and rollback evidence

- [ ] An authorized publisher explicitly confirmed publication.
- [ ] The active dataset metadata and representative Thai/Latin searches were verified.
- [ ] A failed index test preserved the prior active version.
- [ ] A rollback test restored the selected prior version without deleting newer history or audit events.
- [ ] Version ID, publication time, verification actor, and outcome were recorded.

## Release blockers

Do not publish when source provenance is unclear, validation is blocking, public fields differ from the approved configuration, accessibility review has a critical failure, or rollback readiness is unverified.
