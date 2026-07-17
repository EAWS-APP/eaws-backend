-- =============================================================================
-- EAWS Phase 3: Role-Based Access, Dispatch Assignments, Alerts, Safe Zones
-- Run this in the Supabase SQL editor.
-- This script is additive and designed to avoid modifying auth.users directly.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS postgis;

-- -----------------------------------------------------------------------------
-- 1. Profiles / Users
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  phone_number TEXT,
  ghana_card TEXT,
  user_role TEXT NOT NULL DEFAULT 'citizen',
  operator_code TEXT UNIQUE,
  agency_type TEXT,
  agency_id UUID,
  unit_id UUID,
  is_approved BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT profiles_user_role_check CHECK (
    user_role IN (
      'citizen',
      'dispatcher',
      'police',
      'ambulance',
      'fire',
      'nadmo',
      'admin',
      'super_admin'
    )
  ),
  CONSTRAINT profiles_agency_type_check CHECK (
    agency_type IS NULL OR agency_type IN ('police', 'ambulance', 'fire', 'nadmo')
  )
);

CREATE INDEX IF NOT EXISTS idx_profiles_user_role ON public.profiles(user_role);
CREATE INDEX IF NOT EXISTS idx_profiles_operator_code ON public.profiles(operator_code);
CREATE INDEX IF NOT EXISTS idx_profiles_agency_type ON public.profiles(agency_type);

-- Keep updated_at fresh.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS profiles_set_updated_at ON public.profiles;
CREATE TRIGGER profiles_set_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- Automatically create a citizen profile for new Supabase Auth users.
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (
    user_id,
    full_name,
    phone_number,
    ghana_card,
    user_role,
    is_approved,
    is_active
  )
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    COALESCE(NEW.raw_user_meta_data->>'phone_number', NEW.phone),
    NEW.raw_user_meta_data->>'ghana_card',
    COALESCE(NEW.raw_user_meta_data->>'user_role', 'citizen'),
    COALESCE((NEW.raw_user_meta_data->>'is_approved')::BOOLEAN, TRUE),
    TRUE
  )
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_create_profile ON auth.users;
CREATE TRIGGER on_auth_user_created_create_profile
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_auth_user();

-- -----------------------------------------------------------------------------
-- 2. Agencies And Units
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.agencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  agency_type TEXT NOT NULL UNIQUE,
  region TEXT,
  contact_number TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT agencies_agency_type_check CHECK (
    agency_type IN ('police', 'ambulance', 'fire', 'nadmo')
  )
);

ALTER TABLE public.agencies
ADD COLUMN IF NOT EXISTS agency_type TEXT,
ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

UPDATE public.agencies
SET agency_type = CASE
  WHEN agency_type IS NOT NULL THEN agency_type
  WHEN LOWER(name) LIKE '%police%' THEN 'police'
  WHEN LOWER(name) LIKE '%ambulance%' THEN 'ambulance'
  WHEN LOWER(name) LIKE '%fire%' THEN 'fire'
  WHEN LOWER(name) LIKE '%nadmo%' THEN 'nadmo'
  ELSE LOWER(REGEXP_REPLACE(name, '\s+', '_', 'g'))
END
WHERE agency_type IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_agencies_agency_type_unique ON public.agencies(agency_type);
CREATE INDEX IF NOT EXISTS idx_agencies_is_active ON public.agencies(is_active);

DROP TRIGGER IF EXISTS agencies_set_updated_at ON public.agencies;
CREATE TRIGGER agencies_set_updated_at
BEFORE UPDATE ON public.agencies
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.agencies (name, agency_type, region, contact_number)
VALUES
  ('Ghana Police Service', 'police', 'Greater Accra', '191'),
  ('National Ambulance Service', 'ambulance', 'Greater Accra', '193'),
  ('Ghana National Fire Service', 'fire', 'Greater Accra', '192'),
  ('NADMO', 'nadmo', 'Greater Accra', '112')
ON CONFLICT (agency_type) DO UPDATE SET
  name = EXCLUDED.name,
  region = EXCLUDED.region,
  contact_number = EXCLUDED.contact_number,
  updated_at = NOW();

CREATE TABLE IF NOT EXISTS public.agency_units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID REFERENCES public.agencies(id) ON DELETE CASCADE,
  callsign TEXT NOT NULL,
  unit_type TEXT,
  status TEXT NOT NULL DEFAULT 'AVAILABLE',
  current_latitude DOUBLE PRECISION,
  current_longitude DOUBLE PRECISION,
  location GEOGRAPHY(POINT, 4326),
  last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT agency_units_status_check CHECK (
    status IN ('AVAILABLE', 'DISPATCHED', 'EN_ROUTE', 'ON_SCENE', 'OUT_OF_SERVICE')
  ),
  UNIQUE (agency_id, callsign)
);

ALTER TABLE public.agency_units
ADD COLUMN IF NOT EXISTS unit_type TEXT,
ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_agency_units_agency_id ON public.agency_units(agency_id);
CREATE INDEX IF NOT EXISTS idx_agency_units_status ON public.agency_units(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_agency_units_agency_callsign_unique
ON public.agency_units(agency_id, callsign);

CREATE OR REPLACE FUNCTION public.update_agency_unit_location()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.current_latitude IS NOT NULL AND NEW.current_longitude IS NOT NULL THEN
    NEW.location = ST_SetSRID(ST_MakePoint(NEW.current_longitude, NEW.current_latitude), 4326)::geography;
  END IF;
  NEW.last_updated = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_agency_unit_location_trigger ON public.agency_units;
CREATE TRIGGER set_agency_unit_location_trigger
BEFORE INSERT OR UPDATE OF current_latitude, current_longitude, status ON public.agency_units
FOR EACH ROW
EXECUTE FUNCTION public.update_agency_unit_location();

-- Example starter units. Edit or remove as needed.
INSERT INTO public.agency_units (agency_id, callsign, unit_type, status, current_latitude, current_longitude)
SELECT id, 'POL-0021', 'patrol', 'AVAILABLE', 5.6037, -0.1870
FROM public.agencies WHERE agency_type = 'police'
ON CONFLICT (agency_id, callsign) DO NOTHING;

INSERT INTO public.agency_units (agency_id, callsign, unit_type, status, current_latitude, current_longitude)
SELECT id, 'AMB-110', 'ambulance', 'AVAILABLE', 5.5900, -0.1700
FROM public.agencies WHERE agency_type = 'ambulance'
ON CONFLICT (agency_id, callsign) DO NOTHING;

INSERT INTO public.agency_units (agency_id, callsign, unit_type, status, current_latitude, current_longitude)
SELECT id, 'FIRE-119', 'engine', 'AVAILABLE', 5.5507, -0.2078
FROM public.agencies WHERE agency_type = 'fire'
ON CONFLICT (agency_id, callsign) DO NOTHING;

-- Add foreign keys after both tables exist.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_agency_id_fkey'
  ) THEN
    ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_agency_id_fkey
    FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_unit_id_fkey'
  ) THEN
    ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_unit_id_fkey
    FOREIGN KEY (unit_id) REFERENCES public.agency_units(id) ON DELETE SET NULL;
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 3. Incidents: Normalize Fields Used By Mobile And Dashboards
-- -----------------------------------------------------------------------------

ALTER TABLE public.incidents
ADD COLUMN IF NOT EXISTS reporter_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS emergency_type TEXT,
ADD COLUMN IF NOT EXISTS category TEXT,
ADD COLUMN IF NOT EXISTS title TEXT,
ADD COLUMN IF NOT EXISTS description TEXT,
ADD COLUMN IF NOT EXISTS is_anonymous BOOLEAN NOT NULL DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS severity TEXT NOT NULL DEFAULT 'PENDING TRIAGE',
ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS location_name TEXT,
ADD COLUMN IF NOT EXISTS address TEXT,
ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS location GEOGRAPHY(POINT, 4326),
ADD COLUMN IF NOT EXISTS likes_count INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS comments_count INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS views_count INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_incidents_status ON public.incidents(status);
CREATE INDEX IF NOT EXISTS idx_incidents_severity ON public.incidents(severity);
CREATE INDEX IF NOT EXISTS idx_incidents_category ON public.incidents(category);
CREATE INDEX IF NOT EXISTS idx_incidents_reporter_id ON public.incidents(reporter_id);
CREATE INDEX IF NOT EXISTS idx_incidents_created_at ON public.incidents(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_incidents_location ON public.incidents USING GIST(location);

CREATE OR REPLACE FUNCTION public.update_incident_location()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
    NEW.location = ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326)::geography;
  END IF;

  IF NEW.reporter_id IS NULL AND NEW.user_id IS NOT NULL THEN
    NEW.reporter_id = NEW.user_id;
  END IF;

  IF NEW.user_id IS NULL AND NEW.reporter_id IS NOT NULL THEN
    NEW.user_id = NEW.reporter_id;
  END IF;

  IF NEW.category IS NULL AND NEW.emergency_type IS NOT NULL THEN
    NEW.category = NEW.emergency_type;
  END IF;

  IF NEW.emergency_type IS NULL AND NEW.category IS NOT NULL THEN
    NEW.emergency_type = NEW.category;
  END IF;

  IF NEW.location_name IS NULL AND NEW.address IS NOT NULL THEN
    NEW.location_name = NEW.address;
  END IF;

  IF NEW.address IS NULL AND NEW.location_name IS NOT NULL THEN
    NEW.address = NEW.location_name;
  END IF;

  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_location_trigger ON public.incidents;
CREATE TRIGGER set_location_trigger
BEFORE INSERT OR UPDATE ON public.incidents
FOR EACH ROW
EXECUTE FUNCTION public.update_incident_location();

-- -----------------------------------------------------------------------------
-- 4. Community Comments And Reactions
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.incident_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id UUID NOT NULL REFERENCES public.incidents(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_incident_comments_incident_id ON public.incident_comments(incident_id);

DROP TRIGGER IF EXISTS incident_comments_set_updated_at ON public.incident_comments;
CREATE TRIGGER incident_comments_set_updated_at
BEFORE UPDATE ON public.incident_comments
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.incident_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id UUID NOT NULL REFERENCES public.incidents(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reaction_type TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (incident_id, user_id, reaction_type),
  CONSTRAINT incident_reactions_type_check CHECK (
    reaction_type IN ('like', 'alarmed', 'concerned')
  )
);

CREATE INDEX IF NOT EXISTS idx_incident_reactions_incident_id ON public.incident_reactions(incident_id);

CREATE OR REPLACE FUNCTION public.refresh_incident_counts()
RETURNS TRIGGER AS $$
DECLARE
  target_incident_id UUID;
BEGIN
  target_incident_id = COALESCE(NEW.incident_id, OLD.incident_id);

  UPDATE public.incidents
  SET
    comments_count = (
      SELECT COUNT(*) FROM public.incident_comments WHERE incident_id = target_incident_id
    ),
    likes_count = (
      SELECT COUNT(*) FROM public.incident_reactions
      WHERE incident_id = target_incident_id AND reaction_type = 'like'
    ),
    updated_at = NOW()
  WHERE id = target_incident_id;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS refresh_incident_counts_after_comment ON public.incident_comments;
CREATE TRIGGER refresh_incident_counts_after_comment
AFTER INSERT OR UPDATE OR DELETE ON public.incident_comments
FOR EACH ROW
EXECUTE FUNCTION public.refresh_incident_counts();

DROP TRIGGER IF EXISTS refresh_incident_counts_after_reaction ON public.incident_reactions;
CREATE TRIGGER refresh_incident_counts_after_reaction
AFTER INSERT OR UPDATE OR DELETE ON public.incident_reactions
FOR EACH ROW
EXECUTE FUNCTION public.refresh_incident_counts();

-- -----------------------------------------------------------------------------
-- 5. Dispatch Assignments
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.incident_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id UUID NOT NULL REFERENCES public.incidents(id) ON DELETE CASCADE,
  agency_id UUID NOT NULL REFERENCES public.agencies(id) ON DELETE RESTRICT,
  agency_type TEXT NOT NULL,
  unit_id UUID REFERENCES public.agency_units(id) ON DELETE SET NULL,
  assigned_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'assigned',
  priority TEXT NOT NULL DEFAULT 'medium',
  notes TEXT,
  eta_minutes INTEGER,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  acknowledged_at TIMESTAMPTZ,
  en_route_at TIMESTAMPTZ,
  arrived_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT incident_assignments_agency_type_check CHECK (
    agency_type IN ('police', 'ambulance', 'fire', 'nadmo')
  ),
  CONSTRAINT incident_assignments_status_check CHECK (
    status IN (
      'assigned',
      'acknowledged',
      'en_route',
      'on_scene',
      'patient_contacted',
      'patient_transported',
      'hospital_handoff',
      'contained',
      'secured',
      'resolved',
      'cancelled'
    )
  ),
  CONSTRAINT incident_assignments_priority_check CHECK (
    priority IN ('low', 'medium', 'high', 'critical')
  )
);

CREATE INDEX IF NOT EXISTS idx_incident_assignments_incident_id ON public.incident_assignments(incident_id);
CREATE INDEX IF NOT EXISTS idx_incident_assignments_agency_type ON public.incident_assignments(agency_type);
CREATE INDEX IF NOT EXISTS idx_incident_assignments_status ON public.incident_assignments(status);
CREATE INDEX IF NOT EXISTS idx_incident_assignments_unit_id ON public.incident_assignments(unit_id);

DROP TRIGGER IF EXISTS incident_assignments_set_updated_at ON public.incident_assignments;
CREATE TRIGGER incident_assignments_set_updated_at
BEFORE UPDATE ON public.incident_assignments
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.response_status_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES public.incident_assignments(id) ON DELETE CASCADE,
  incident_id UUID NOT NULL REFERENCES public.incidents(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  from_status TEXT,
  to_status TEXT NOT NULL,
  notes TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_response_status_events_assignment_id ON public.response_status_events(assignment_id);
CREATE INDEX IF NOT EXISTS idx_response_status_events_incident_id ON public.response_status_events(incident_id);

-- -----------------------------------------------------------------------------
-- 6. Public Alerts And Safe Zones
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'advisory',
  icon TEXT NOT NULL DEFAULT 'alert-triangle',
  checklist JSONB NOT NULL DEFAULT '[]'::jsonb,
  target_region TEXT,
  target_latitude DOUBLE PRECISION,
  target_longitude DOUBLE PRECISION,
  radius_meters INTEGER,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  CONSTRAINT alerts_severity_check CHECK (severity IN ('advisory', 'watch', 'warning'))
);

CREATE INDEX IF NOT EXISTS idx_alerts_is_active ON public.alerts(is_active);
CREATE INDEX IF NOT EXISTS idx_alerts_created_at ON public.alerts(created_at DESC);

DROP TRIGGER IF EXISTS alerts_set_updated_at ON public.alerts;
CREATE TRIGGER alerts_set_updated_at
BEFORE UPDATE ON public.alerts
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.safe_zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  location GEOGRAPHY(POINT, 4326),
  status TEXT NOT NULL DEFAULT 'open',
  capacity INTEGER,
  current_count INTEGER,
  managed_by UUID REFERENCES public.agencies(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT safe_zones_status_check CHECK (status IN ('open', 'full', 'closed'))
);

CREATE INDEX IF NOT EXISTS idx_safe_zones_status ON public.safe_zones(status);
CREATE INDEX IF NOT EXISTS idx_safe_zones_location ON public.safe_zones USING GIST(location);

CREATE OR REPLACE FUNCTION public.update_safe_zone_location()
RETURNS TRIGGER AS $$
BEGIN
  NEW.location = ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326)::geography;
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_safe_zone_location_trigger ON public.safe_zones;
CREATE TRIGGER set_safe_zone_location_trigger
BEFORE INSERT OR UPDATE OF latitude, longitude, status, current_count ON public.safe_zones
FOR EACH ROW
EXECUTE FUNCTION public.update_safe_zone_location();

INSERT INTO public.safe_zones (name, address, latitude, longitude, status, capacity, current_count)
VALUES
  ('Accra Sports Stadium Shelter', 'Liberation Rd, Accra', 5.5494, -0.1876, 'open', 500, 42),
  ('National Theatre Relief Centre', 'Independence Ave, Accra', 5.5471, -0.2037, 'open', 300, 18),
  ('University of Ghana Safe Point', 'Legon Campus, Accra', 5.6505, -0.1862, 'open', 800, 5),
  ('Korle-Bu Teaching Hospital', 'Guggisberg Ave, Accra', 5.5348, -0.2267, 'open', 200, 90),
  ('Tema Community Centre', 'Tema, Greater Accra', 5.6698, -0.0166, 'open', 350, 12)
ON CONFLICT DO NOTHING;

-- -----------------------------------------------------------------------------
-- 7. Audit Logs
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_id ON public.audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON public.audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at DESC);

-- -----------------------------------------------------------------------------
-- 8. Security Helper Functions
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT user_role FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_user_agency_type()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT agency_type FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_ops_user()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    public.current_user_role() IN (
      'dispatcher',
      'police',
      'ambulance',
      'fire',
      'nadmo',
      'admin',
      'super_admin'
    ),
    FALSE
  );
$$;

CREATE OR REPLACE FUNCTION public.is_admin_user()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(public.current_user_role() IN ('admin', 'super_admin'), FALSE);
$$;

-- -----------------------------------------------------------------------------
-- 9. Row Level Security
-- -----------------------------------------------------------------------------

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incident_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incident_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agency_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incident_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.response_status_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.safe_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Profiles
DROP POLICY IF EXISTS "profiles_select_own_or_admin" ON public.profiles;
CREATE POLICY "profiles_select_own_or_admin"
ON public.profiles FOR SELECT
TO authenticated
USING (user_id = auth.uid() OR public.is_admin_user());

DROP POLICY IF EXISTS "profiles_update_own_limited" ON public.profiles;
CREATE POLICY "profiles_update_own_limited"
ON public.profiles FOR UPDATE
TO authenticated
USING (user_id = auth.uid() OR public.is_admin_user())
WITH CHECK (user_id = auth.uid() OR public.is_admin_user());

-- Incidents
DROP POLICY IF EXISTS "incidents_insert_authenticated" ON public.incidents;
CREATE POLICY "incidents_insert_authenticated"
ON public.incidents FOR INSERT
TO authenticated
WITH CHECK (COALESCE(reporter_id, user_id, auth.uid()) = auth.uid() OR public.is_ops_user());

DROP POLICY IF EXISTS "incidents_select_public_or_related" ON public.incidents;
CREATE POLICY "incidents_select_public_or_related"
ON public.incidents FOR SELECT
TO authenticated
USING (
  is_verified = TRUE
  OR reporter_id = auth.uid()
  OR user_id = auth.uid()
  OR public.is_ops_user()
);

DROP POLICY IF EXISTS "incidents_update_owner_or_ops" ON public.incidents;
CREATE POLICY "incidents_update_owner_or_ops"
ON public.incidents FOR UPDATE
TO authenticated
USING (reporter_id = auth.uid() OR user_id = auth.uid() OR public.is_ops_user())
WITH CHECK (reporter_id = auth.uid() OR user_id = auth.uid() OR public.is_ops_user());

-- Comments
DROP POLICY IF EXISTS "comments_select_verified_or_own" ON public.incident_comments;
CREATE POLICY "comments_select_verified_or_own"
ON public.incident_comments FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.incidents i
    WHERE i.id = incident_id AND (i.is_verified = TRUE OR public.is_ops_user())
  )
);

DROP POLICY IF EXISTS "comments_insert_authenticated" ON public.incident_comments;
CREATE POLICY "comments_insert_authenticated"
ON public.incident_comments FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "comments_update_own" ON public.incident_comments;
CREATE POLICY "comments_update_own"
ON public.incident_comments FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "comments_delete_own_or_admin" ON public.incident_comments;
CREATE POLICY "comments_delete_own_or_admin"
ON public.incident_comments FOR DELETE
TO authenticated
USING (user_id = auth.uid() OR public.is_admin_user());

-- Reactions
DROP POLICY IF EXISTS "reactions_select_authenticated" ON public.incident_reactions;
CREATE POLICY "reactions_select_authenticated"
ON public.incident_reactions FOR SELECT
TO authenticated
USING (TRUE);

DROP POLICY IF EXISTS "reactions_insert_authenticated" ON public.incident_reactions;
CREATE POLICY "reactions_insert_authenticated"
ON public.incident_reactions FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "reactions_delete_own" ON public.incident_reactions;
CREATE POLICY "reactions_delete_own"
ON public.incident_reactions FOR DELETE
TO authenticated
USING (user_id = auth.uid());

-- Agencies and units
DROP POLICY IF EXISTS "agencies_select_authenticated" ON public.agencies;
CREATE POLICY "agencies_select_authenticated"
ON public.agencies FOR SELECT
TO authenticated
USING (TRUE);

DROP POLICY IF EXISTS "agency_units_select_authenticated" ON public.agency_units;
CREATE POLICY "agency_units_select_authenticated"
ON public.agency_units FOR SELECT
TO authenticated
USING (TRUE);

DROP POLICY IF EXISTS "agency_units_update_ops" ON public.agency_units;
CREATE POLICY "agency_units_update_ops"
ON public.agency_units FOR UPDATE
TO authenticated
USING (public.is_ops_user())
WITH CHECK (public.is_ops_user());

-- Assignments
DROP POLICY IF EXISTS "assignments_select_ops_by_agency" ON public.incident_assignments;
CREATE POLICY "assignments_select_ops_by_agency"
ON public.incident_assignments FOR SELECT
TO authenticated
USING (
  public.current_user_role() IN ('dispatcher', 'admin', 'super_admin')
  OR agency_type = public.current_user_agency_type()
);

DROP POLICY IF EXISTS "assignments_insert_dispatcher_admin" ON public.incident_assignments;
CREATE POLICY "assignments_insert_dispatcher_admin"
ON public.incident_assignments FOR INSERT
TO authenticated
WITH CHECK (public.current_user_role() IN ('dispatcher', 'admin', 'super_admin'));

DROP POLICY IF EXISTS "assignments_update_ops_by_agency" ON public.incident_assignments;
CREATE POLICY "assignments_update_ops_by_agency"
ON public.incident_assignments FOR UPDATE
TO authenticated
USING (
  public.current_user_role() IN ('dispatcher', 'admin', 'super_admin')
  OR agency_type = public.current_user_agency_type()
)
WITH CHECK (
  public.current_user_role() IN ('dispatcher', 'admin', 'super_admin')
  OR agency_type = public.current_user_agency_type()
);

-- Status events
DROP POLICY IF EXISTS "status_events_select_ops" ON public.response_status_events;
CREATE POLICY "status_events_select_ops"
ON public.response_status_events FOR SELECT
TO authenticated
USING (public.is_ops_user());

DROP POLICY IF EXISTS "status_events_insert_ops" ON public.response_status_events;
CREATE POLICY "status_events_insert_ops"
ON public.response_status_events FOR INSERT
TO authenticated
WITH CHECK (public.is_ops_user());

-- Alerts and safe zones
DROP POLICY IF EXISTS "alerts_select_active" ON public.alerts;
CREATE POLICY "alerts_select_active"
ON public.alerts FOR SELECT
TO authenticated
USING (is_active = TRUE OR public.is_ops_user());

DROP POLICY IF EXISTS "alerts_write_dispatcher_admin_nadmo" ON public.alerts;
CREATE POLICY "alerts_write_dispatcher_admin_nadmo"
ON public.alerts FOR ALL
TO authenticated
USING (public.current_user_role() IN ('dispatcher', 'nadmo', 'admin', 'super_admin'))
WITH CHECK (public.current_user_role() IN ('dispatcher', 'nadmo', 'admin', 'super_admin'));

DROP POLICY IF EXISTS "safe_zones_select_authenticated" ON public.safe_zones;
CREATE POLICY "safe_zones_select_authenticated"
ON public.safe_zones FOR SELECT
TO authenticated
USING (TRUE);

DROP POLICY IF EXISTS "safe_zones_write_nadmo_admin" ON public.safe_zones;
CREATE POLICY "safe_zones_write_nadmo_admin"
ON public.safe_zones FOR ALL
TO authenticated
USING (public.current_user_role() IN ('nadmo', 'admin', 'super_admin'))
WITH CHECK (public.current_user_role() IN ('nadmo', 'admin', 'super_admin'));

-- Audit logs
DROP POLICY IF EXISTS "audit_logs_select_admin" ON public.audit_logs;
CREATE POLICY "audit_logs_select_admin"
ON public.audit_logs FOR SELECT
TO authenticated
USING (public.is_admin_user());

DROP POLICY IF EXISTS "audit_logs_insert_ops" ON public.audit_logs;
CREATE POLICY "audit_logs_insert_ops"
ON public.audit_logs FOR INSERT
TO authenticated
WITH CHECK (public.is_ops_user());

-- -----------------------------------------------------------------------------
-- 10. Useful Views For Dashboards
-- -----------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.dispatcher_incident_queue AS
SELECT
  i.*,
  COUNT(a.id) AS assignment_count
FROM public.incidents i
LEFT JOIN public.incident_assignments a ON a.incident_id = i.id
WHERE i.status IN ('pending', 'verified', 'assigned', 'in_progress', 'active')
GROUP BY i.id
ORDER BY i.created_at DESC;

CREATE OR REPLACE VIEW public.agency_assignment_queue AS
SELECT
  a.id AS assignment_id,
  a.agency_type,
  a.status AS assignment_status,
  a.priority,
  a.eta_minutes,
  a.assigned_at,
  a.updated_at AS assignment_updated_at,
  u.callsign,
  i.id AS incident_id,
  i.title,
  i.category,
  i.severity,
  i.status AS incident_status,
  i.description,
  i.location_name,
  i.latitude,
  i.longitude,
  i.created_at AS incident_created_at
FROM public.incident_assignments a
JOIN public.incidents i ON i.id = a.incident_id
LEFT JOIN public.agency_units u ON u.id = a.unit_id
ORDER BY a.assigned_at DESC;

-- =============================================================================
-- End of EAWS Phase 3 schema.
-- =============================================================================
