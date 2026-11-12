create or replace function directory.activate_school_directory_version(
  p_version_id uuid,
  p_job_id uuid,
  p_actor_id text,
  p_actor_role text
)
returns setof directory.dataset_versions
language plpgsql
security definer
set search_path = pg_catalog, directory
as $$
declare
  v_job directory.import_jobs%rowtype;
  v_version directory.dataset_versions%rowtype;
  v_source_ids uuid[];
  v_manifest_ids uuid[];
  v_file_count integer;
  v_grade_count integer;
  v_record_count integer;
begin
  if p_actor_role is null or p_actor_role not in ('publisher', 'owner') then
    raise exception 'PUBLISHER_ROLE_REQUIRED' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(pg_catalog.hashtext('phichai-school-directory-publish')::bigint);

  select * into v_job
  from directory.import_jobs
  where id = p_job_id
  for update;
  if not found then
    raise exception 'IMPORT_JOB_NOT_FOUND' using errcode = 'P0002';
  end if;

  select * into v_version
  from directory.dataset_versions
  where id = p_version_id
  for update;
  if not found then
    raise exception 'DATASET_VERSION_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_job.status = 'published' and v_job.published_version_id = p_version_id then
    return next v_version;
    return;
  end if;
  if v_job.status <> 'ready_for_review' or v_job.blocking then
    raise exception 'IMPORT_JOB_NOT_READY' using errcode = '55000';
  end if;
  if v_version.status <> 'ready' then
    raise exception 'DATASET_VERSION_NOT_READY' using errcode = '55000';
  end if;
  if v_version.academic_year <> v_job.academic_year
     or v_version.mapping_version <> v_job.mapping_version
     or v_version.parser_version <> v_job.parser_version
     or v_version.student_count <> v_job.accepted_row_count
     or v_version.warning_count <> v_job.warning_row_count then
    raise exception 'DATASET_COUNTS_OR_MAPPING_MISMATCH' using errcode = '23514';
  end if;
  if v_version.field_config_version <> 'phichai-student-number-public-v1' then
    raise exception 'PUBLIC_STUDENT_NUMBER_POLICY_REQUIRED' using errcode = '23514';
  end if;
  if not exists (
    select 1
    from directory.approved_field_config config
    where config.version = v_version.field_config_version
      and config.student_identifier_display = 'public'
      and config.student_identifier_search = 'exact_only'
      and 'studentNumber' = any(config.student_public_fields)
  ) then
    raise exception 'PUBLIC_STUDENT_NUMBER_POLICY_INVALID' using errcode = '23514';
  end if;

  select count(*), count(distinct substring(lower(file_name) from '^m[.]([1-6])-'))
  into v_file_count, v_grade_count
  from directory.source_files
  where job_id = p_job_id
    and source_type = 'approved_student_xlsx'
    and academic_year = v_job.academic_year
    and lower(file_name) ~ ('^m[.][1-6]-' || right(v_job.academic_year, 2) || '[.]xlsx$');
  if v_file_count <> 6 or v_grade_count <> 6
     or coalesce(array_length(v_version.source_file_ids, 1), 0) <> 6 then
    raise exception 'SCHOOL_WORKBOOK_SET_INCOMPLETE' using errcode = '23514';
  end if;

  select array_agg(id order by id)
  into v_source_ids
  from directory.source_files
  where job_id = p_job_id;
  select array_agg(source_id order by source_id)
  into v_manifest_ids
  from unnest(v_version.source_file_ids) as manifest(source_id);
  if v_source_ids is distinct from v_manifest_ids then
    raise exception 'SOURCE_MANIFEST_MISMATCH' using errcode = '23514';
  end if;

  select count(*) into v_record_count
  from directory.published_student_records
  where dataset_version_id = p_version_id;
  if v_record_count <> v_version.student_count then
    raise exception 'PUBLISHED_RECORD_COUNT_MISMATCH' using errcode = '23514';
  end if;
  if exists (
    select 1
    from directory.published_student_records student_row
    where student_row.dataset_version_id = p_version_id
      and (
        student_row.student_identifier is null
        or btrim(student_row.student_identifier) = ''
        or not (student_row.source_file_id = any(v_version.source_file_ids))
      )
  ) then
    raise exception 'PUBLISHED_RECORD_POLICY_OR_SOURCE_MISMATCH' using errcode = '23514';
  end if;

  update directory.dataset_versions
  set status = 'superseded', superseded_at = now()
  where status = 'active';

  update directory.dataset_versions
  set status = 'active', activated_by = p_actor_id, activated_at = now(), published_at = now()
  where id = p_version_id
  returning * into v_version;
  if not found then
    raise exception 'DATASET_ACTIVATION_FAILED' using errcode = '55000';
  end if;

  update directory.import_jobs
  set status = 'published', published_version_id = p_version_id, updated_at = now()
  where id = p_job_id;

  insert into directory.audit_events (
    event, actor_id, actor_role, job_id, dataset_version_id, outcome, safe_metadata
  ) values (
    'publish_succeeded', p_actor_id, p_actor_role, p_job_id, p_version_id, 'success',
    jsonb_build_object('version', v_version.version, 'studentCount', v_version.student_count, 'sourceFileCount', 6)
  );

  return next v_version;
end;
$$;

revoke all on function directory.activate_school_directory_version(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function directory.activate_school_directory_version(uuid, uuid, text, text) to service_role;
