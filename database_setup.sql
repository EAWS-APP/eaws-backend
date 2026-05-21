-- ==============================================================================
-- EAWS: Advanced Database Algorithms (Written by Antigravity)
-- ==============================================================================

-- 1. Enable PostGIS extension for advanced GPS calculations
CREATE EXTENSION IF NOT EXISTS postgis;

-- 2. Add a PostGIS geography column to the incidents table
-- (We use geography because it automatically calculates distances in meters)
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS location GEOGRAPHY(POINT, 4326);

-- 3. Create a function to automatically set the geography point when lat/lng are inserted
CREATE OR REPLACE FUNCTION update_incident_location()
RETURNS TRIGGER AS $$
BEGIN
  -- Convert latitude and longitude to a PostGIS point
  NEW.location = ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326)::geography;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. Create the trigger so it runs every time Qoder's API inserts an incident
DROP TRIGGER IF EXISTS set_location_trigger ON incidents;
CREATE TRIGGER set_location_trigger
BEFORE INSERT OR UPDATE OF latitude, longitude ON incidents
FOR EACH ROW
EXECUTE FUNCTION update_incident_location();


-- ==============================================================================
-- DUPLICATE INCIDENT DETECTION ALGORITHM
-- ==============================================================================
-- This function finds nearby incidents of the same type within 100 meters, 
-- reported in the last 15 minutes. Qoder's Node.js API can call this!
-- ==============================================================================

CREATE OR REPLACE FUNCTION detect_duplicate_incidents(
  new_lat DOUBLE PRECISION, 
  new_lng DOUBLE PRECISION, 
  incident_type TEXT
)
RETURNS TABLE (
  incident_id UUID,
  distance_meters DOUBLE PRECISION,
  time_since_report INTERVAL
) AS $$
DECLARE
  new_point GEOGRAPHY := ST_SetSRID(ST_MakePoint(new_lng, new_lat), 4326)::geography;
BEGIN
  RETURN QUERY
  SELECT 
    id,
    ST_Distance(location, new_point) AS distance_meters,
    NOW() - created_at AS time_since_report
  FROM incidents
  WHERE 
    emergency_type = incident_type
    AND status = 'pending'
    AND ST_DWithin(location, new_point, 100) -- Within 100 meters
    AND created_at >= NOW() - INTERVAL '15 minutes'; -- Within the last 15 minutes
END;
$$ LANGUAGE plpgsql;

-- ==============================================================================
-- GET NEARBY INCIDENTS ALGORITHM (FOR LIVE MAP)
-- ==============================================================================
-- This function finds incidents within a specific radius of a user's location.
-- The Next.js dashboard uses this to plot incidents on the map.
-- ==============================================================================

CREATE OR REPLACE FUNCTION get_nearby_incidents(
  user_lat DOUBLE PRECISION, 
  user_lng DOUBLE PRECISION, 
  radius_meters DOUBLE PRECISION,
  filter_emergency_type TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  emergency_type TEXT,
  description TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  address TEXT,
  status TEXT,
  created_at TIMESTAMPTZ,
  distance_meters DOUBLE PRECISION
) AS $$
DECLARE
  user_point GEOGRAPHY := ST_SetSRID(ST_MakePoint(user_lng, user_lat), 4326)::geography;
BEGIN
  RETURN QUERY
  SELECT 
    i.id,
    i.emergency_type,
    i.description,
    i.latitude,
    i.longitude,
    i.address,
    i.status,
    i.created_at,
    ST_Distance(i.location, user_point) AS distance_meters
  FROM incidents i
  WHERE 
    ST_DWithin(i.location, user_point, radius_meters)
    AND (filter_emergency_type IS NULL OR i.emergency_type = filter_emergency_type)
  ORDER BY distance_meters ASC;
END;
$$ LANGUAGE plpgsql;

-- ==============================================================================
-- EAWS PHASE 2: SCHEMA EXPANSION (SOCIAL & AGENCIES)
-- ==============================================================================

-- 1. Expand Incidents Table
ALTER TABLE incidents
ADD COLUMN IF NOT EXISTS is_anonymous BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS category TEXT,
ADD COLUMN IF NOT EXISTS title TEXT,
ADD COLUMN IF NOT EXISTS severity TEXT DEFAULT 'PENDING TRIAGE',
ADD COLUMN IF NOT EXISTS location_name TEXT,
ADD COLUMN IF NOT EXISTS likes_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS comments_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS views_count INTEGER DEFAULT 0;

-- 2. Incident Comments Table
CREATE TABLE IF NOT EXISTS incident_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    incident_id UUID REFERENCES incidents(id) ON DELETE CASCADE,
    user_id UUID NOT NULL, -- References auth.users or profiles
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Incident Reactions Table
CREATE TABLE IF NOT EXISTS incident_reactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    incident_id UUID REFERENCES incidents(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    reaction_type TEXT NOT NULL, -- 'like', 'alarmed', 'concerned'
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(incident_id, user_id, reaction_type)
);

-- 4. Agencies Table
CREATE TABLE IF NOT EXISTS agencies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL, -- 'Police', 'Fire', 'Ambulance', 'NADMO'
    region TEXT,
    contact_number TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Agency Units Table (e.g., Patrol Car 1, Fire Engine 3)
CREATE TABLE IF NOT EXISTS agency_units (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agency_id UUID REFERENCES agencies(id) ON DELETE CASCADE,
    callsign TEXT NOT NULL,
    status TEXT DEFAULT 'AVAILABLE', -- 'AVAILABLE', 'DISPATCHED', 'OUT_OF_SERVICE'
    current_latitude DOUBLE PRECISION,
    current_longitude DOUBLE PRECISION,
    location GEOGRAPHY(POINT, 4326),
    last_updated TIMESTAMPTZ DEFAULT NOW()
);
