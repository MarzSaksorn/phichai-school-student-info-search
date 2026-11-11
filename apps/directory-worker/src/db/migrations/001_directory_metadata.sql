create schema if not exists directory;

create table if not exists directory.source_files (
  id uuid primary key default gen_random_uuid(),
  job_id uuid,
  file_name text not null,
  content_type text not null,
  byte_size bigint not null check (byte_size >= 0),
  checksum_sha256 text not null check (checksum_sha256 ~ '^[0-9a-f]{64}$'),
  storage_path text not null unique,
  academic_year text not null,
  source_type text not null check (source_type in ('approved_student_xlsx', 'approved_staff_source')),
  uploaded_by text not null,
  uploaded_at timestamptz not null default now()
);

create table if not exists directory.import_jobs (
  id uuid primary key default gen_random_uuid(),
  status text not null check (status in ('uploaded', 'scanning', 'validating', 'rejected', 'ready_for_review', 'publishing', 'indexing', 'published', 'publish_failed', 'rolled_back', 'cancelled')),
  source_type text not null check (source_type in ('approved_student_xlsx', 'approved_staff_source')),
  academic_year text not null,
  parser_version text not null,
  mapping_version text not null,
  uploader_id text not null,
  accepted_row_count integer not null default 0 check (accepted_row_count >= 0),
  rejected_row_count integer not null default 0 check (rejected_row_count >= 0),
  warning_row_count integer not null default 0 check (warning_row_count >= 0),
  blocking boolean not null default false,
  published_version_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table directory.source_files
  drop constraint if exists source_files_job_id_fkey;
alter table directory.source_files
  add constraint source_files_job_id_fkey
  foreign key (job_id) references directory.import_jobs(id) on delete restrict;

create table if not exists directory.import_issues (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references directory.import_jobs(id) on delete cascade,
  severity text not null check (severity in ('error', 'warning')),
  code text not null,
  file_id uuid references directory.source_files(id) on delete restrict,
  file_name text not null,
  sheet_name text,
  row_number integer check (row_number is null or row_number > 0),
  safe_message text not null,
  created_at timestamptz not null default now()
);

create table if not exists directory.dataset_versions (
  id uuid primary key default gen_random_uuid(),
  version text not null unique,
  academic_year text not null,
  status text not null check (status in ('building', 'ready', 'active', 'superseded', 'publish_failed', 'rolled_back')),
  parser_version text not null,
  mapping_version text not null,
  source_file_ids uuid[] not null default '{}',
  student_count integer not null default 0 check (student_count >= 0),
  staff_count integer not null default 0 check (staff_count >= 0),
  warning_count integer not null default 0 check (warning_count >= 0),
  created_by text not null,
  activated_by text,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  activated_at timestamptz,
  superseded_at timestamptz
);

create unique index if not exists dataset_versions_one_active_idx
  on directory.dataset_versions (status)
  where status = 'active';

alter table directory.import_jobs
  drop constraint if exists import_jobs_published_version_id_fkey;
alter table directory.import_jobs
  add constraint import_jobs_published_version_id_fkey
  foreign key (published_version_id) references directory.dataset_versions(id) on delete restrict;

create table if not exists directory.audit_events (
  id uuid primary key default gen_random_uuid(),
  event text not null check (event in ('login', 'upload', 'validation_started', 'validation_completed', 'preview_generated', 'publish_requested', 'publish_succeeded', 'publish_failed', 'rollback_requested', 'rollback_succeeded', 'source_deleted', 'permission_changed')),
  actor_id text not null,
  actor_role text check (actor_role in ('importer', 'publisher', 'operator', 'owner')),
  job_id uuid references directory.import_jobs(id) on delete restrict,
  dataset_version_id uuid references directory.dataset_versions(id) on delete restrict,
  outcome text not null check (outcome in ('success', 'failure')),
  request_id text,
  safe_metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create table if not exists directory.approved_field_config (
  version text primary key,
  effective_from timestamptz not null,
  student_public_fields text[] not null,
  staff_public_fields text[] not null,
  student_identifier_search text not null check (student_identifier_search in ('disabled', 'exact_only', 'authenticated_exact_only')),
  student_identifier_display text not null check (student_identifier_display in ('disabled', 'masked', 'authenticated_only')),
  no_result_disclosure text not null default 'generic' check (no_result_disclosure = 'generic'),
  created_by text not null,
  created_at timestamptz not null default now()
);

create index if not exists import_jobs_status_created_idx
  on directory.import_jobs (status, created_at desc);
create index if not exists source_files_job_id_idx
  on directory.source_files (job_id);
create index if not exists import_issues_job_created_idx
  on directory.import_issues (job_id, created_at);
create index if not exists import_issues_file_id_idx
  on directory.import_issues (file_id);
create index if not exists import_jobs_published_version_id_idx
  on directory.import_jobs (published_version_id);
create index if not exists audit_events_job_id_idx
  on directory.audit_events (job_id);
create index if not exists audit_events_dataset_version_id_idx
  on directory.audit_events (dataset_version_id);
create index if not exists audit_events_occurred_idx
  on directory.audit_events (occurred_at desc);

-- Keep administrative metadata out of the exposed Data API surface. No client
-- policies are created intentionally: server-side worker access uses the
-- service role, while anon/authenticated access must fail closed.
revoke all on schema directory from anon, authenticated;
revoke all on all tables in schema directory from anon, authenticated;

alter table directory.source_files enable row level security;
alter table directory.import_jobs enable row level security;
alter table directory.import_issues enable row level security;
alter table directory.dataset_versions enable row level security;
alter table directory.audit_events enable row level security;
alter table directory.approved_field_config enable row level security;
