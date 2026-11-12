# Decision 0002: Public student-number display and exact search

**Date:** 2026-11-12  
**Status:** Approved for implementation by the school-authorized project requestor; production enablement remains gated on migration, import review, and publication confirmation.

## Context

The approved workbook already contains a student-number column, and the importer stores it as the internal `studentIdentifier`. The public API previously excluded it. The requestor confirmed that the school approved showing the student number publicly and allowing search by it.

## Decision

- Public results may include the value under the API/UI field name `studentNumber`, only when the active dataset links to approved field-config version `phichai-student-number-public-v1`.
- Digit-only queries use exact equality against the stored identifier. Partial number matching is not allowed.
- A missing or restrictive field configuration fails closed: no number is returned and exact number search is disabled.
- Continue to keep the internal property name `studentIdentifier`, source file/sheet/row details, raw workbook values, and query values out of public responses and telemetry.
- The public page must clearly state that numbers are displayed under school approval.

## Consequences

- Migration `007_public_student_number_policy.sql` adds the approved `public` display mode and ties a dataset version to its field-config version.
- Publication records the policy version on the dataset; the API reads the active version's policy before displaying/searching numbers.
- The API and UI can ship before the dataset is re-published without exposing existing numbers: older active versions have no policy link and therefore fail closed.
- Before a new version is published, review accepted/rejected counts and obtain explicit publication confirmation.
