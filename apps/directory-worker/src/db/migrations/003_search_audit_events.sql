-- Task 8: permit privacy-safe public search security telemetry.
-- No query text, identifiers, IP addresses, names, or result rows belong in safe_metadata.
alter table directory.audit_events
  drop constraint if exists audit_events_event_check;

alter table directory.audit_events
  add constraint audit_events_event_check
  check (event in (
    'login', 'upload', 'validation_started', 'validation_completed', 'preview_generated',
    'publish_requested', 'publish_succeeded', 'publish_failed', 'rollback_requested',
    'rollback_succeeded', 'source_deleted', 'permission_changed', 'search_requested',
    'search_succeeded', 'search_failed', 'search_rate_limited'
  ));
