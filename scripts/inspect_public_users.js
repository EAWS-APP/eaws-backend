require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  console.log('📡 Reading public.users table...');
  const { data: users, error } = await admin.from('users').select('*').limit(10);
  if (error) {
    console.error('Error reading public.users:', error.message);
  } else {
    console.log(`Found ${users.length} users in public.users:`);
    users.forEach(u => {
      console.log(`- ID: ${u.id}, Email: ${u.email || u.email_address || 'N/A'}, Role: ${u.role || u.user_role || 'N/A'}`);
    });
  }
}

main().catch(console.error);
