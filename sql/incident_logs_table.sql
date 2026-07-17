-- =============================================================================
-- EAWS: Create incident_logs table for Radio Comms & Triage tracking
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.incident_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id UUID REFERENCES public.incidents(id) ON DELETE CASCADE,
  operator_code TEXT NOT NULL,
  status_logged TEXT NOT NULL,
  remarks TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.incident_logs ENABLE ROW LEVEL SECURITY;

-- Select policy
DROP POLICY IF EXISTS "incident_logs_select_policy" ON public.incident_logs;
CREATE POLICY "incident_logs_select_policy" 
ON public.incident_logs FOR SELECT 
TO authenticated 
USING (true);

-- Insert policy
DROP POLICY IF EXISTS "incident_logs_insert_policy" ON public.incident_logs;
CREATE POLICY "incident_logs_insert_policy" 
ON public.incident_logs FOR INSERT 
TO authenticated 
WITH CHECK (true);
