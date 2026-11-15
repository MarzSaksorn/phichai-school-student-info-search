alter table directory.staff_snapshot_records
  add column if not exists email text;

alter table directory.published_staff_records
  add column if not exists email text;

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
  from directory.staff_snapshot_jobs as snapshot_job
  where snapshot_job.id = p_snapshot_id
  for update;
  if not found then
    raise exception 'STAFF_SNAPSHOT_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_snapshot.status = 'approved' then
    select * into v_publication
    from directory.staff_publication_versions as publication
    where publication.snapshot_id = p_snapshot_id;
    if not found then
      raise exception 'STAFF_PUBLICATION_MISSING' using errcode = '55000';
    end if;
    select count(*) into v_record_count
    from directory.published_staff_records as published_record
    where published_record.publication_version_id = v_publication.id;
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
    publication_version_id, public_id, display_name, search_name, category, title, department, email
  )
  select
    v_publication.id, source_record.public_id, source_record.display_name, source_record.search_name,
    source_record.category, source_record.title, source_record.department, source_record.email
  from directory.staff_snapshot_records as source_record
  where source_record.snapshot_id = p_snapshot_id;

  select count(*) into v_record_count
  from directory.published_staff_records as published_record
  where published_record.publication_version_id = v_publication.id;
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
    jsonb_build_object(
      'snapshotId', p_snapshot_id,
      'acceptedCount', v_snapshot.accepted_count,
      'publicFields', case
        when v_snapshot.schema_version = 'staff-web-card-v3'
          then jsonb_build_array('displayName', 'category', 'title', 'department', 'email')
        else jsonb_build_array('displayName', 'category', 'title', 'department')
      end
    )
  );

  return query select v_publication.id, p_snapshot_id, v_publication.status, v_publication.published_at, v_record_count;
end;
$$;

revoke all on function directory.publish_staff_snapshot(uuid, text, text) from public, anon, authenticated;
grant execute on function directory.publish_staff_snapshot(uuid, text, text) to service_role;
