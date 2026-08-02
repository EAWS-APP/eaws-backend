require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  console.log('📡 Listing tables in public schema...');
  // We can query the information_schema via a trick, since PostgREST doesn't expose it directly, 
  // but wait, is there a way to run raw SQL using RPC?
  // Let's check what RPC functions are available by checking if we get an error or list them.
  // Actually, we can check if a table like "users" exists by trying to select from it.
  const tables = ['users', 'profiles', 'incidents', 'responses', 'agencies', 'agency_units', 'alerts'];
  for (const table of tables) {
    const { error } = await admin.from(table).select('*').limit(1);
    if (!error) {
      console.log(`✅ Table '${table}' exists and is queryable.`);
    } else if (error.message.includes('does not exist') || error.message.includes('schema cache')) {
      console.log(`✗ Table '${table}' does not exist.`);
    } else {
      console.log(`? Table '${table}' check: ${error.message}`);
    }
  }
}

main().catch(console.error);
