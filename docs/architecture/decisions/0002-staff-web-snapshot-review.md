# ADR 0002: Review-only staff web snapshot adapter

- **Status:** Proposed implementation; production use pending school-owner approval
- **Date:** 2026-11-15
- **Decision owners:** School data owner, authorized publisher, and implementation team

## Context

The project has a separate staff record model, but the school has not provided a staff XLSX export. The public staff page at `https://main.phichai.ac.th/school-staff` visibly contains staff display names, categories or roles, and some academic-rank text. The current data contract does not approve website-derived records as a production source.

## Decision

Implement a **review-only parser** for an operator-provided HTML snapshot. The parser accepts only the exact staff-page URL as source metadata, recognizes the current staff-card shape under schema `staff-web-card-v1`, normalizes the approved display fields, records restricted source traceability, and returns a validation report with `publishable: false`.

The adapter does not fetch the website, schedule a crawler, write to Supabase, change the active dataset, or publish staff records. It is a parsing and review boundary only.

The first approved public fields are limited to `displayName`, `category`, and optional `title`. The parser does not retain image URLs, biography text, arbitrary card HTML, or unapproved fields in normalized records. Duplicate display names remain separate records and create a warning for operator review.

## Approval required before production use

The school owner must approve the staff page as a source, the exact public fields, the snapshot refresh cadence, the handling of removals and corrections, the privacy notice, the retention period for raw snapshots, and the publisher responsible for each release. Until those decisions are recorded, the current source rule remains unchanged: website-derived records cannot be published.

## Consequences

This keeps the student XLSX boundary unchanged and gives the team a deterministic way to review staff snapshots without introducing an always-on synchronization job. The parser depends on the school page’s current HTML card classes, so a page redesign must fail closed and produce an empty or invalid review rather than silently importing a different page structure. A future production workflow should add private snapshot storage, a source manifest, an admin review screen, staff-specific normalization and publication migration, and rollback evidence before enabling publication.
