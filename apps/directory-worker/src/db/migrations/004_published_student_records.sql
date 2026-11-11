create table if not exists directory.published_student_records (
  id uuid primary key default gen_random_uuid(),
  dataset_version_id uuid not null references directory.dataset_versions(id) on delete cascade,
  public_id text not null,
  display_name text not null,
  search_name text not null,
  student_identifier text,
  academic_year text not null,
  grade text not null,
  room text not null,
  status text,
  source_file_id uuid not null references directory.source_files(id) on delete restrict,
  source_sheet text not null,
  source_row integer not null check (source_row > 0),
  created_at timestamptz not null default now(),
  unique (dataset_version_id, public_id)
);

create index if not exists published_student_records_version_idx
  on directory.published_student_records (dataset_version_id, id);
create index if not exists published_student_records_search_name_idx
  on directory.published_student_records (dataset_version_id, search_name);
create index if not exists published_student_records_filters_idx
  on directory.published_student_records (dataset_version_id, academic_year, grade, room, status);
create index if not exists published_student_records_identifier_idx
  on directory.published_student_records (dataset_version_id, student_identifier)
  where student_identifier is not null;

-- Published rows remain server-only. Public access is mediated by the Vercel API,
-- which applies the public-field policy and pagination before returning JSON.
revoke all on directory.published_student_records from anon, authenticated;
alter table directory.published_student_records enable row level security;
