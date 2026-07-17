-- =============================================================================
-- EAWS: Add Medical Profile Columns to Profiles
-- Run this script in the Supabase SQL editor.
-- =============================================================================

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS allergies TEXT,
ADD COLUMN IF NOT EXISTS chronic_illnesses TEXT,
ADD COLUMN IF NOT EXISTS blood_group TEXT,
ADD COLUMN IF NOT EXISTS preferred_hospital TEXT,
ADD COLUMN IF NOT EXISTS medical_notes TEXT;

-- Verify columns exist
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_schema = 'public' AND table_name = 'profiles';
