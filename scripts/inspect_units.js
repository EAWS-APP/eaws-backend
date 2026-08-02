require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  console.log('📡 Fetching raw agency_units row...');
  const { data, error } = await admin.from('agency_units').select('*').limit(3);
  if (error) { console.error(error.message); return; }
  if (!data.length) { console.log('No rows in agency_units'); return; }
  console.log('Columns:', Object.keys(data[0]).join(', '));
  console.log('Sample row:', JSON.stringify(data[0], null, 2));
}
main().catch(console.error);
