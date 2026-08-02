require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  const dispatcherId = '3df6b4d4-5809-41b1-8682-688d536aff25';
  
  console.log('Testing insert into public.users...');
  const payload = {
    id: dispatcherId,
    full_name: 'Dispatcher Operator',
    phone_number: '+233551234567'
  };

  const { data, error } = await admin.from('users').insert(payload).select();
  if (error) {
    console.error('Insert failed:', error.message);
  } else {
    console.log('✅ Insert succeeded!', data);
  }
}

main().catch(console.error);
