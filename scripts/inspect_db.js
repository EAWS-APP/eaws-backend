require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  console.log('📡 Fetching Incidents...');
  const { data: incidents, error: incErr } = await admin.from('incidents').select('*');
  if (incErr) console.error('Incidents fetch error:', incErr);
  else {
    console.log(`Found ${incidents.length} incidents in DB:`);
    incidents.forEach(inc => {
      console.log(`- ID: ${inc.id}, Title: "${inc.title}", Status: ${inc.status}, Verified: ${inc.is_verified}, Reporter: ${inc.reporter_id}`);
    });
  }

  console.log('\n📡 Fetching Auth Users...');
  const { data: authUsersData, error: authUsersErr } = await admin.auth.admin.listUsers();
  if (authUsersErr) console.error('Auth users fetch error:', authUsersErr);
  else {
    console.log(`Found ${authUsersData.users.length} auth users in DB:`);
    authUsersData.users.forEach(u => {
      console.log(`- ID: ${u.id}, Email: ${u.email}`);
    });
  }

  console.log('\n📡 Fetching Agencies...');
  const { data: agencies, error: agErr } = await admin.from('agencies').select('*');
  if (agErr) console.error('Agencies fetch error:', agErr);
  else {
    console.log(`Found ${agencies.length} agencies in DB:`);
    agencies.forEach(ag => {
      console.log(`- ID: ${ag.id}, Name: "${ag.name}", Type: ${ag.type || 'N/A'}`);
    });
  }
}

main().catch(console.error);
