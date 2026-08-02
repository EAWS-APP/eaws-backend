/**
 * End-to-end test: Login → Get Profile → Fetch Incidents → Dispatch
 * Tests the full Sentinel Command workflow
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const BACKEND = 'http://127.0.0.1:5001/api';
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

async function step(label, fn) {
  process.stdout.write(`\n🔷 ${label}... `);
  try {
    const result = await fn();
    console.log('✅ PASS');
    return result;
  } catch (e) {
    console.log(`❌ FAIL\n   → ${e.message}`);
    return null;
  }
}

async function apiGet(path, token) {
  const res = await fetch(`${BACKEND}${path}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${body.error || JSON.stringify(body)}`);
  return body;
}

async function apiPost(path, token, data) {
  const res = await fetch(`${BACKEND}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(data)
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${body.error || JSON.stringify(body)}`);
  return body;
}

async function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  SENTINEL COMMAND — End-to-End Test Suite');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // 1. Health check
  await step('Health check', async () => {
    const res = await fetch(`${BACKEND}/health`);
    if (!res.ok) throw new Error('Backend not reachable');
    const body = await res.json();
    console.log(`\n   Status: ${body.status}`);
  });

  // 2. Login as dispatcher
  let token;
  const loginResult = await step('Login dispatcher@eaws.gov.gh', async () => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: 'dispatcher@eaws.gov.gh',
      password: 'password123'
    });
    if (error) throw new Error(error.message);
    return data.session.access_token;
  });
  token = loginResult;
  if (!token) { console.log('\n❌ Cannot continue without token'); process.exit(1); }

  // 3. Get profile from /api/me
  let profile;
  await step('GET /api/me — resolve dispatcher profile', async () => {
    const data = await apiGet('/me', token);
    profile = data.profile;
    console.log(`\n   Role: ${profile.user_role}, Code: ${profile.operator_code}`);
    if (profile.user_role !== 'dispatcher') throw new Error('Unexpected role');
  });

  // 4. Fetch live incidents
  let incidentId;
  await step('GET /incidents/live — fetch active incidents', async () => {
    const data = await apiGet('/incidents/live', token);
    const list = data.incidents || data;
    const count = Array.isArray(list) ? list.length : 0;
    console.log(`\n   Found ${count} incident(s)`);
    if (count > 0) {
      incidentId = list[0].id;
      console.log(`   First incident ID: ${incidentId}`);
      console.log(`   Title: ${list[0].title}`);
      console.log(`   Status: ${list[0].status}`);
    }
  });

  // 5. Fetch units
  await step('GET /units/live — fetch agency units', async () => {
    const data = await apiGet('/units/live', token);
    const list = data.units || data;
    const count = Array.isArray(list) ? list.length : 0;
    console.log(`\n   Found ${count} unit(s)`);
    if (count > 0) {
      console.log(`   First unit: ${list[0].name} [${list[0].agency_type}] — ${list[0].status}`);
    }
  });

  // 6. Dispatch to an incident
  if (incidentId) {
    await step(`POST /incidents/${incidentId}/dispatch — dispatch police unit`, async () => {
      const data = await apiPost(`/incidents/${incidentId}/dispatch`, token, {
        agency_type: 'police',
        notes: 'E2E test dispatch — automated'
      });
      if (!data.success) throw new Error('Dispatch returned success=false');
      const r = data.response;
      console.log(`\n   Response ID: ${r.id}`);
      console.log(`   Agency: ${r.agency}, Status: ${r.status}`);
      console.log(`   Dispatched by: ${r.dispatched_by}`);
    });
  } else {
    console.log('\n⚠️  Skipping dispatch test — no incidents available');
  }

  // 7. Login as police operator
  let policeToken;
  await step('Login police@eaws.gov.gh', async () => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: 'police@eaws.gov.gh',
      password: 'password123'
    });
    if (error) throw new Error(error.message);
    policeToken = data.session.access_token;
    console.log(`\n   Token acquired`);
  });

  if (policeToken) {
    await step('GET /api/me for police profile', async () => {
      const data = await apiGet('/me', policeToken);
      const p = data.profile;
      console.log(`\n   Role: ${p.user_role}, Code: ${p.operator_code}`);
    });
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  Test run complete');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

main().catch(console.error);
