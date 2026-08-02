require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

async function main() {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: 'dispatcher@eaws.gov.gh',
    password: 'password123'
  });

  if (error) {
    console.error('Auth failed:', error.message);
    return;
  }

  const token = data.session.access_token;
  console.log('Auth successful.');

  console.log('\nTesting /api/incidents/live...');
  let res = await fetch('http://127.0.0.1:5001/api/incidents/live', {
    headers: { Authorization: `Bearer ${token}` }
  });
  console.log('Status:', res.status);
  let json = await res.json();
  console.log('Response:', JSON.stringify(json, null, 2));

  console.log('\nTesting /api/units/live...');
  res = await fetch('http://127.0.0.1:5001/api/units/live', {
    headers: { Authorization: `Bearer ${token}` }
  });
  console.log('Status:', res.status);
  json = await res.json();
  console.log('Response:', JSON.stringify(json, null, 2));
}

main().catch(console.error);
