/**
 * EAWS Profile Inspector — checks profiles table structure and updates profiles
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const OPERATORS = [
  { email: 'dispatcher@eaws.gov.gh', role: 'dispatcher', code: 'DISP-0001', agency: null,       name: 'Central Dispatcher', id: '3df6b4d4-5809-41b1-8682-688d536aff25' },
  { email: 'police@eaws.gov.gh',     role: 'police',     code: 'POL-0021',  agency: 'police',    name: 'Police Operator',    id: 'e7bbcbc3-ae82-443f-87f2-11ac0777dd0a' },
  { email: 'fire@eaws.gov.gh',       role: 'fire',       code: 'GNFS-0012', agency: 'fire',      name: 'Fire Operator',      id: '35b3ee85-7673-4b9c-91b6-d121a5e98afc' },
  { email: 'ambulance@eaws.gov.gh',  role: 'ambulance',  code: 'AMB-0003',  agency: 'ambulance', name: 'EMS Operator',       id: '99db5df2-1f8e-47f5-a3d8-98455b32dfe5' },
  { email: 'admin@eaws.gov.gh',      role: 'admin',      code: 'ADMIN-001', agency: null,        name: 'System Admin',       id: '8a7d6f77-bcf1-4fbc-b6fa-946c84d85187' },
  { email: 'citizen@eaws.gov.gh',    role: 'citizen',    code: null,        agency: null,        name: 'Test Citizen',       id: '7614b28a-29e3-41c2-87b8-c45880395730' },
];

async function main() {
  console.log('🔍 Inspecting profiles table...\n');

  // 1. Read any existing rows
  const { data: existing, error: readErr } = await admin.from('profiles').select('*').limit(5);
  if (readErr) {
    console.log('❌ Cannot read profiles table:', readErr.message);
    console.log('\n📋 Checking column names by trying a SELECT *...');
  } else {
    console.log('✅ profiles table accessible. Sample rows:', existing?.length || 0);
    if (existing && existing.length > 0) {
      console.log('   Column names found:', Object.keys(existing[0]).join(', '));
    } else {
      console.log('   Table exists but is empty.');
    }
  }

  // 2. Try to figure out the correct primary key column
  const testFields = ['id', 'user_id', 'uid', 'auth_id', 'profile_id'];
  for (const field of testFields) {
    const { data, error } = await admin.from('profiles').select(field).limit(1);
    if (!error) {
      console.log(`\n✅ Column '${field}' EXISTS in profiles table`);
    } else if (error.message.includes('does not exist') || error.message.includes('schema cache')) {
      console.log(`   ✗ Column '${field}' not found`);
    } else {
      console.log(`   ? Column '${field}' check: ${error.message}`);
    }
  }

  // 3. Try updating profiles using user_id as the key instead of id
  console.log('\n\n🔧 Attempting profile updates with user_id column...');
  for (const op of OPERATORS) {
    const payload = {
      user_id: op.id,
      full_name: op.name,
      user_role: op.role,
      operator_code: op.code || null,
      agency_type: op.agency || null,
      is_approved: true,
      is_active: true,
    };
    const { error } = await admin.from('profiles').upsert(payload, { onConflict: 'user_id' });
    if (error) {
      console.log(`   ❌ ${op.email}: ${error.message}`);
    } else {
      console.log(`   ✅ ${op.email} profile updated`);
    }
  }
}

main().catch(console.error);
