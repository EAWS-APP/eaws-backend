-- ============================================================
-- EAWS helper RPC: get incidents near a coordinate.
-- Run this in Supabase SQL Editor after the incidents table
-- has the PostGIS location column and trigger installed.
-- ============================================================

create or replace function get_nearby_incidents(
  user_lat double precision,
  user_lng double precision,
  radius_meters integer default 1000,
  filter_emergency_type text default null
)
returns table (
  id uuid,
  emergency_type text,
  status text,
  latitude double precision,
  longitude double precision,
  description text,
  address text,
  created_at timestamptz,
  distance_meters double precision
) as $$
declare
  user_point geography := st_setsrid(st_makepoint(user_lng, user_lat), 4326)::geography;
begin
  return query
  select
    incidents.id,
    incidents.emergency_type,
    incidents.status,
    incidents.latitude,
    incidents.longitude,
    incidents.description,
    incidents.address,
    incidents.created_at,
    st_distance(incidents.location, user_point) as distance_meters
  from incidents
  where
    incidents.location is not null
    and st_dwithin(incidents.location, user_point, radius_meters)
    and (
      filter_emergency_type is null
      or incidents.emergency_type = filter_emergency_type
    )
  order by distance_meters asc, incidents.created_at desc;
end;
$$ language plpgsql stable;
