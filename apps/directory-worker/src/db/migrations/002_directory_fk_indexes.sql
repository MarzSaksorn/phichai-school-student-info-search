create index if not exists source_files_job_id_idx
  on directory.source_files (job_id);

create index if not exists import_issues_file_id_idx
  on directory.import_issues (file_id);

create index if not exists import_jobs_published_version_id_idx
  on directory.import_jobs (published_version_id);

create index if not exists audit_events_job_id_idx
  on directory.audit_events (job_id);

create index if not exists audit_events_dataset_version_id_idx
  on directory.audit_events (dataset_version_id);
