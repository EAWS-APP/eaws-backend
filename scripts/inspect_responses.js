require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  console.log('📡 Reading responses table...');
  const { data: responses, error: respErr } = await admin.from('responses').select('*').limit(1);
  if (respErr) {
    console.error('responses read error:', respErr.message);
  } else {
    console.log('✅ responses table accessible. Columns:', Object.keys(responses[0] || {}).join(', '));
  }
}

main().catch(console.error);
