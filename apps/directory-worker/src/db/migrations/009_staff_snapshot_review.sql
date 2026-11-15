create table if not exists directory.staff_snapshot_jobs (
  id uuid primary key default gen_random_uuid(),
  status text not null check (status in ('uploaded', 'validating', 'rejected', 'ready_for_review', 'approved', 'cancelled')),
  source_type text not null check (source_type = 'staff_web_snapshot_review'),
  source_url text not null check (source_url = 'https://main.phichai.ac.th/school-staff'),
  captured_at timestamptz not null,
  parser_version text not null,
  schema_version text not null,
  storage_path text not null,
  checksum_sha256 text not null,
  byte_size integer not null check (byte_size > 0),
  accepted_count integer not null default 0 check (accepted_count >= 0),
  rejected_count integer not null default 0 check (rejected_count >= 0),
  warning_count integer not null default 0 check (warning_count >= 0),
  blocking boolean not null default false,
  uploader_id text not null,
  reviewer_id text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists directory.staff_snapshot_records (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references directory.staff_snapshot_jobs(id) on delete cascade,
  ordinal integer not null check (ordinal > 0),
  public_id text not null,
  display_name text not null,
  search_name text not null,
  category text not null,
  title text,
  source_row integer not null check (source_row > 0),
  created_at timestamptz not null default now(),
  unique (snapshot_id, public_id),
  unique (snapshot_id, ordinal)
);

create table if not exists directory.staff_snapshot_issues (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references directory.staff_snapshot_jobs(id) on delete cascade,
  severity text not null check (severity in ('error', 'warning')),
  code text not null,
  ordinal integer,
  safe_message text not null,
  created_at timestamptz not null default now()
);

create index if not exists staff_snapshot_jobs_status_created_idx
  on directory.staff_snapshot_jobs (status, created_at desc);
create index if not exists staff_snapshot_records_snapshot_idx
  on directory.staff_snapshot_records (snapshot_id, ordinal);
create index if not exists staff_snapshot_records_search_idx
  on directory.staff_snapshot_records (snapshot_id, search_name);
create index if not exists staff_snapshot_issues_snapshot_idx
  on directory.staff_snapshot_issues (snapshot_id, created_at);

revoke all on directory.staff_snapshot_jobs from anon, authenticated;
revoke all on directory.staff_snapshot_records from anon, authenticated;
revoke all on directory.staff_snapshot_issues from anon, authenticated;
alter table directory.staff_snapshot_jobs enable row level security;
alter table directory.staff_snapshot_records enable row level security;
alter table directory.staff_snapshot_issues enable row level security;
