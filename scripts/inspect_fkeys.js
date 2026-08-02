require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  console.log('📡 Inspecting foreign keys on responses table...');
  const sql = `
    SELECT
      tc.constraint_name, 
      tc.table_name, 
      kcu.column_name, 
      ccu.table_name AS foreign_table_name,
      ccu.column_name AS foreign_column_name 
    FROM 
      information_schema.table_constraints AS tc 
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_name='responses';
  `;

  // We don't have direct SQL runner, but we can query by attempting an insert and catching schema errors,
  // or we can select from information_schema columns. Let's see if we can do it by querying pg_catalog or information_schema tables
  // directly through supabase.from().
  // Wait, Supabase allows querying views in information_schema if they are exposed. Let's see if we can read table_constraints.
  
  const { data, error } = await admin.from('responses').select('*, profiles!responses_dispatched_by_fkey(*)').limit(1);
  if (error) {
    console.log('Error querying relation:', error.message);
  } else {
    console.log('Queried successfully:', data);
  }
}

main().catch(console.error);
