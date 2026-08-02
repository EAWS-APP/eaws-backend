require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  console.log('📡 Listing Supabase Auth users...');
  const { data: { users }, error } = await admin.auth.admin.listUsers();
  if (error) { console.error('Error:', error.message); return; }

  console.log(`\nFound ${users.length} auth user(s):\n`);
  for (const u of users) {
    console.log(`▸ ${u.email} (ID: ${u.id})`);
    
    // Check profile
    const { data: profile } = await admin.from('profiles').select('*').eq('user_id', u.id).single();
    if (profile) {
      console.log(`  ✅ Profile: role=${profile.user_role}, code=${profile.operator_code || 'N/A'}, approved=${profile.is_approved}, active=${profile.is_active}`);
    } else {
      console.log(`  ⚠️  No profile found`);
    }
  }
}

main().catch(console.error);
