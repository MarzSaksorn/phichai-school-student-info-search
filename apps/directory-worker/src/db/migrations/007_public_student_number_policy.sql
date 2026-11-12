-- The school approved public display and exact search by student number on 2026-11-12.
-- Keep the approval as versioned field configuration; do not make identifier exposure a
-- permanent hard-coded assumption in the public API.

alter table directory.approved_field_config
  drop constraint if exists approved_field_config_student_identifier_display_check;

alter table directory.approved_field_config
  add constraint approved_field_config_student_identifier_display_check
  check (student_identifier_display in ('disabled', 'masked', 'authenticated_only', 'public'));

alter table directory.dataset_versions
  add column if not exists field_config_version text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'dataset_versions_field_config_version_fkey'
  ) then
    alter table directory.dataset_versions
      add constraint dataset_versions_field_config_version_fkey
      foreign key (field_config_version) references directory.approved_field_config(version);
  end if;
end $$;

insert into directory.approved_field_config (
  version,
  effective_from,
  student_public_fields,
  staff_public_fields,
  student_identifier_search,
  student_identifier_display,
  no_result_disclosure,
  created_by
) values (
  'phichai-student-number-public-v1',
  now(),
  array['displayName', 'studentNumber', 'academicYear', 'grade', 'room'],
  array[]::text[],
  'exact_only',
  'public',
  'generic',
  'migration:007_public_student_number_policy'
) on conflict (version) do nothing;
