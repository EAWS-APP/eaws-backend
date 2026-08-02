require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

async function main() {
  const { data: authData, error } = await supabase.auth.signInWithPassword({
    email: 'dispatcher@eaws.gov.gh',
    password: 'password123'
  });

  if (error) {
    console.error('Auth failed:', error.message);
    return;
  }

  const token = authData.session.access_token;
  console.log('Auth successful.');

  const testIncidentId = '78c8feac-17e5-46f2-9d66-fe03d9d3eff9';

  console.log(`\nAttempting to dispatch incident ${testIncidentId} to "police"...`);
  const res = await fetch(`http://127.0.0.1:5001/api/incidents/${testIncidentId}/dispatch`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      agency_type: 'police',
      priority: 'medium'
    })
  });

  console.log('Status:', res.status);
  const json = await res.json();
  console.log('Response:', JSON.stringify(json, null, 2));
}

main().catch(console.error);
