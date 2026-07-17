-- ==============================================================================
-- EAWS CUSTOM AUTHENTICATION: OTP STORAGE
-- Run this in your Supabase SQL Editor
-- ==============================================================================

-- 1. Create a table to securely store our custom alphanumeric OTPs
CREATE TABLE IF NOT EXISTS public.custom_otps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    identifier TEXT NOT NULL, -- The user's email address or phone number
    otp_code TEXT NOT NULL,   -- The 8-character alphanumeric code (e.g., P9GA41B5)
    type TEXT NOT NULL,       -- Type of OTP: 'signup', 'login', 'reset'
    expires_at TIMESTAMPTZ NOT NULL, -- When the code expires (usually 15 mins)
    created_at TIMESTAMPTZ DEFAULT NOW(),
    used BOOLEAN DEFAULT FALSE
);

-- 2. Create an index to make lookups lightning fast
CREATE INDEX IF NOT EXISTS custom_otps_identifier_idx ON public.custom_otps (identifier);
CREATE INDEX IF NOT EXISTS custom_otps_code_idx ON public.custom_otps (otp_code);

-- 3. Set up Row Level Security (RLS) to ensure only the Service Role (Edge Functions) can access this table
ALTER TABLE public.custom_otps ENABLE ROW LEVEL SECURITY;

-- Policy: Only allow admin/service role to insert, view, or update
CREATE POLICY "Service Role Only" ON public.custom_otps
    USING (auth.jwt() ->> 'role' = 'service_role')
    WITH CHECK (auth.jwt() ->> 'role' = 'service_role');
