/**
 * Quick end-to-end test of the login flow:
 * 1. Sign in with Supabase
 * 2. Call /api/me with the token
 * 3. Print what role we get back
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

const TEST_ACCOUNTS = [
  { email: 'dispatcher@eaws.gov.gh', password: 'password123' },
  { email: 'police@eaws.gov.gh',     password: 'password123' },
  { email: 'admin@eaws.gov.gh',      password: 'password123' },
];

async function testLogin(email, password) {
  process.stdout.write(`🔐 ${email} ... `);
  
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    console.log(`❌ Supabase auth FAILED: ${error.message}`);
    return;
  }

  const token = data.session?.access_token;
  if (!token) {
    console.log('❌ No access token returned');
    return;
  }

  // Call /api/me
  const resp = await fetch('http://127.0.0.1:5001/api/me', {
    headers: { Authorization: `Bearer ${token}` }
  });
  const json = await resp.json();

  if (!resp.ok) {
    console.log(`❌ /api/me failed (${resp.status}): ${JSON.stringify(json)}`);
    return;
  }

  const role = json.profile?.user_role;
  const code = json.profile?.operator_code;
  console.log(`✅ role=${role}, code=${code || 'N/A'}`);
  
  await supabase.auth.signOut();
}

async function main() {
  console.log('🧪 EAWS Login Flow Test\n');
  for (const { email, password } of TEST_ACCOUNTS) {
    await testLogin(email, password);
  }
  console.log('\n✅ Test complete');
}

main().catch(console.error);
