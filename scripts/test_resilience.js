/**
 * EAWS Local Resilience & Offline Flow Test
 * Tests that both Next.js frontend and Express backend respond correctly using mock configurations.
 * Run with: node scripts/test_resilience.js
 */

const TEST_ROLES = [
  { email: 'dispatcher@eaws.gov.gh', role: 'dispatcher', code: 'DISP-0001' },
  { email: 'police@eaws.gov.gh',     role: 'police',     code: 'POL-0021' },
  { email: 'fire@eaws.gov.gh',       role: 'fire',       code: 'GNFS-0012' },
  { email: 'ambulance@eaws.gov.gh',  role: 'ambulance',  code: 'AMB-0003' },
  { email: 'admin@eaws.gov.gh',      role: 'admin',      code: 'ADMIN-001' }
];

async function checkFrontend() {
  console.log('🌐 TESTING FRONTEND PAGES (Next.js server on port 3000)...');
  const pages = [
    '/',
    '/dashboard',
    '/police',
    '/ambulance',
    '/fire',
    '/admin',
    '/citizen'
  ];

  for (const page of pages) {
    try {
      const res = await fetch(`http://localhost:3000${page}`);
      console.log(`   [GET] ${page.padEnd(12)} -> Status ${res.status} (${res.status === 200 ? '✅ OK' : '❌ FAIL'})`);
    } catch (err) {
      console.log(`   [GET] ${page.padEnd(12)} -> ❌ Server unreachable: ${err.message}`);
    }
  }
}

async function checkBackendEndpoints() {
  console.log('\n📡 TESTING BACKEND ENDPOINTS (Express server on port 5001)...');

  for (const { email, role, code } of TEST_ROLES) {
    const token = `mock-token-${email}`;
    console.log(`\n🔑 Testing as: ${email} (Mock Token)`);

    // 1. Test /api/me
    try {
      const res = await fetch('http://127.0.0.1:5001/api/me', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok && data.success) {
        console.log(`   ✅ /api/me: role resolved as "${data.profile.user_role}" (expected "${role}"), name: "${data.profile.full_name}"`);
      } else {
        console.log(`   ❌ /api/me failed (status ${res.status}):`, data);
      }
    } catch (err) {
      console.log(`   ❌ /api/me call threw error: ${err.message}`);
    }

    // 2. Test /api/incidents/live
    try {
      const res = await fetch('http://127.0.0.1:5001/api/incidents/live', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok && data.success) {
        console.log(`   ✅ /api/incidents/live: loaded ${data.incidents?.length || 0} mock incidents`);
      } else {
        console.log(`   ❌ /api/incidents/live failed (status ${res.status})`);
      }
    } catch (err) {
      console.log(`   ❌ /api/incidents/live call threw error: ${err.message}`);
    }

    // 3. Test /api/units/live
    try {
      const res = await fetch('http://127.0.0.1:5001/api/units/live', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok && data.success) {
        console.log(`   ✅ /api/units/live: loaded ${data.units?.length || 0} mock units`);
      } else {
        console.log(`   ❌ /api/units/live failed (status ${res.status})`);
      }
    } catch (err) {
      console.log(`   ❌ /api/units/live call threw error: ${err.message}`);
    }
  }
}

async function main() {
  console.log('🧪 EAWS Sentinel Command Resilience Test Suite\n');
  await checkFrontend();
  await checkBackendEndpoints();
  console.log('\n🏁 Resilience checks complete.');
}

main().catch(console.error);
