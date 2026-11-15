create table if not exists directory.staff_publication_versions (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null unique references directory.staff_snapshot_jobs(id) on delete restrict,
  status text not null check (status in ('active', 'superseded')),
  published_by text not null,
  published_at timestamptz not null default now(),
  superseded_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists staff_publication_versions_one_active_idx
  on directory.staff_publication_versions (status)
  where status = 'active';

create table if not exists directory.published_staff_records (
  id uuid primary key default gen_random_uuid(),
  publication_version_id uuid not null references directory.staff_publication_versions(id) on delete cascade,
  public_id text not null,
  display_name text not null,
  search_name text not null,
  category text not null,
  title text,
  created_at timestamptz not null default now(),
  unique (publication_version_id, public_id)
);

create index if not exists published_staff_records_publication_idx
  on directory.published_staff_records (publication_version_id, id);
create index if not exists published_staff_records_search_idx
  on directory.published_staff_records (publication_version_id, search_name);

revoke all on directory.staff_publication_versions from anon, authenticated;
revoke all on directory.published_staff_records from anon, authenticated;
alter table directory.staff_publication_versions enable row level security;
alter table directory.published_staff_records enable row level security;

create or replace function directory.publish_staff_snapshot(
  p_snapshot_id uuid,
  p_actor_id text,
  p_actor_role text
)
returns table (
  publication_id uuid,
  snapshot_id uuid,
  publication_status text,
  published_at timestamptz,
  record_count integer
)
language plpgsql
security definer
set search_path = pg_catalog, directory
as $$
declare
  v_snapshot directory.staff_snapshot_jobs%rowtype;
  v_publication directory.staff_publication_versions%rowtype;
  v_record_count integer;
begin
  if p_actor_role is null or p_actor_role not in ('publisher', 'owner') then
    raise exception 'PUBLISHER_ROLE_REQUIRED' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(pg_catalog.hashtext('phichai-school-staff-publish')::bigint);

  select * into v_snapshot
  from directory.staff_snapshot_jobs
  where id = p_snapshot_id
  for update;
  if not found then
    raise exception 'STAFF_SNAPSHOT_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_snapshot.status = 'approved' then
    select * into v_publication
    from directory.staff_publication_versions
    where snapshot_id = p_snapshot_id;
    if not found then
      raise exception 'STAFF_PUBLICATION_MISSING' using errcode = '55000';
    end if;
    select count(*) into v_record_count
    from directory.published_staff_records
    where publication_version_id = v_publication.id;
    return query select v_publication.id, p_snapshot_id, v_publication.status, v_publication.published_at, v_record_count;
    return;
  end if;

  if v_snapshot.status <> 'ready_for_review' or v_snapshot.blocking then
    raise exception 'STAFF_SNAPSHOT_NOT_READY' using errcode = '55000';
  end if;
  if v_snapshot.accepted_count <= 0 or v_snapshot.rejected_count > 0 then
    raise exception 'STAFF_SNAPSHOT_POLICY_FAILED' using errcode = '23514';
  end if;

  update directory.staff_publication_versions
  set status = 'superseded', superseded_at = now()
  where status = 'active';

  insert into directory.staff_publication_versions (snapshot_id, status, published_by)
  values (p_snapshot_id, 'active', p_actor_id)
  returning * into v_publication;

  insert into directory.published_staff_records (
    publication_version_id, public_id, display_name, search_name, category, title
  )
  select
    v_publication.id, public_id, display_name, search_name, category, title
  from directory.staff_snapshot_records
  where snapshot_id = p_snapshot_id;

  select count(*) into v_record_count
  from directory.published_staff_records
  where publication_version_id = v_publication.id;
  if v_record_count <> v_snapshot.accepted_count then
    raise exception 'STAFF_PUBLISHED_RECORD_COUNT_MISMATCH' using errcode = '23514';
  end if;

  update directory.staff_snapshot_jobs
  set status = 'approved', reviewer_id = p_actor_id, reviewed_at = now(), updated_at = now()
  where id = p_snapshot_id;

  insert into directory.audit_events (
    event, actor_id, actor_role, outcome, safe_metadata
  ) values (
    'staff_snapshot_approved', p_actor_id, p_actor_role, 'success',
    jsonb_build_object('snapshotId', p_snapshot_id, 'acceptedCount', v_snapshot.accepted_count, 'publicFields', jsonb_build_array('displayName', 'category', 'title'))
  );

  return query select v_publication.id, p_snapshot_id, v_publication.status, v_publication.published_at, v_record_count;
end;
$$;

revoke all on function directory.publish_staff_snapshot(uuid, text, text) from public, anon, authenticated;
grant execute on function directory.publish_staff_snapshot(uuid, text, text) to service_role;
