create table if not exists directory.observability_events (
  id uuid primary key default gen_random_uuid(),
  event_name text not null check (event_name in ('request_completed', 'request_failed', 'rate_limited', 'health_check', 'alert_evaluated')),
  severity text not null check (severity in ('info', 'warning', 'error', 'critical')),
  request_id text,
  route text not null,
  status_code integer check (status_code is null or status_code between 100 and 599),
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  error_code text,
  safe_metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index if not exists observability_events_occurred_idx
  on directory.observability_events (occurred_at desc);
create index if not exists observability_events_route_occurred_idx
  on directory.observability_events (route, occurred_at desc);
create index if not exists observability_events_event_occurred_idx
  on directory.observability_events (event_name, occurred_at desc);

revoke all on directory.observability_events from anon, authenticated;
alter table directory.observability_events enable row level security;
