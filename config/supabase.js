const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || (!serviceRoleKey && !anonKey)) {
  throw new Error('Missing SUPABASE_URL and a Supabase API key in environment');
}

if (!serviceRoleKey) {
  console.warn('SUPABASE_SERVICE_ROLE_KEY is not set. Falling back to SUPABASE_ANON_KEY.');
}

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey || anonKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const supabasePublic = createClient(supabaseUrl, anonKey || serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

module.exports = {
  supabaseAdmin,
  supabasePublic,
};
