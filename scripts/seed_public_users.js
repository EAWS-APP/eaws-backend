require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const OPERATORS = [
  { id: '3df6b4d4-5809-41b1-8682-688d536aff25', full_name: 'Central Dispatcher', phone_number: '+233551234567', role: 'dispatcher' },
  { id: 'e7bbcbc3-ae82-443f-87f2-11ac0777dd0a', full_name: 'Ghana Police Operator', phone_number: '+233551234568', role: 'police' },
  { id: '35b3ee85-7673-4b9c-91b6-d121a5e98afc', full_name: 'Ghana Fire Operator', phone_number: '+233551234569', role: 'fire' },
  { id: '99db5df2-1f8e-47f5-a3d8-98455b32dfe5', full_name: 'National Ambulance Operator', phone_number: '+233551234570', role: 'ambulance' },
  { id: '8a7d6f77-bcf1-4fbc-b6fa-946c84d85187', full_name: 'Sentinel System Admin', phone_number: '+233551234571', role: 'admin' },
  { id: '7614b28a-29e3-41c2-87b8-c45880395730', full_name: 'Test Citizen User', phone_number: '+233551234572', role: 'citizen' }
];

async function main() {
  console.log('📡 Seeding operators into public.users table...');
  for (const op of OPERATORS) {
    const { data, error } = await admin
      .from('users')
      .upsert(op, { onConflict: 'id' })
      .select();
    
    if (error) {
      console.error(`✗ Failed for ${op.full_name}:`, error.message);
    } else {
      console.log(`✅ Upserted ${op.full_name}`);
    }
  }
}

main().catch(console.error);
