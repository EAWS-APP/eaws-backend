-- ============================================================
-- EAWS incidents API support columns.
-- Safe to run more than once. Use this if your existing
-- incidents table does not already have these fields.
-- ============================================================

alter table incidents
  add column if not exists reporter_id uuid references users(id) on delete set null,
  add column if not exists description text,
  add column if not exists address text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists idx_incidents_reporter_id
  on incidents (reporter_id);

create index if not exists idx_incidents_status
  on incidents (status);

create index if not exists idx_incidents_emergency_type
  on incidents (emergency_type);

create index if not exists idx_incidents_created_at
  on incidents (created_at desc);

create index if not exists idx_incidents_location
  on incidents
  using gist (location);
