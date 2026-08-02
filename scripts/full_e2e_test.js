/**
 * EAWS Sentinel Command — Full E2E Test Suite
 * Tests every backend API endpoint with mock tokens for all 5 operator roles.
 * Run with: node scripts/full_e2e_test.js
 */

const BASE = 'http://127.0.0.1:5001/api';
const FRONTEND = 'http://127.0.0.1:3000';

let passed = 0;
let failed = 0;
const results = [];

const ROLES = [
  { email: 'dispatcher@eaws.gov.gh', role: 'dispatcher', code: 'DISP-0001' },
  { email: 'police@eaws.gov.gh',     role: 'police',     code: 'POL-0021'  },
  { email: 'fire@eaws.gov.gh',       role: 'fire',       code: 'GNFS-0012' },
  { email: 'ambulance@eaws.gov.gh',  role: 'ambulance',  code: 'AMB-0003'  },
  { email: 'admin@eaws.gov.gh',      role: 'admin',      code: 'ADMIN-001' },
];

function token(email) {
  return `mock-token-${email}`;
}

async function hit(method, path, body, email) {
  const opts = {
    method,
    headers: { 'Authorization': `Bearer ${token(email)}`, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(5000)
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, opts);
  let data;
  try { data = await res.json(); } catch { data = {}; }
  return { status: res.status, ok: res.ok, data };
}

async function check(label, fn) {
  try {
    const { pass, detail } = await fn();
    if (pass) {
      passed++;
      console.log(`  ✅ ${label}`);
      if (detail) console.log(`     └─ ${detail}`);
    } else {
      failed++;
      console.log(`  ❌ ${label}`);
      if (detail) console.log(`     └─ ${detail}`);
    }
    results.push({ label, pass, detail });
  } catch (err) {
    failed++;
    console.log(`  ❌ ${label}`);
    console.log(`     └─ THREW: ${err.message}`);
    results.push({ label, pass: false, detail: err.message });
  }
}

// ─── SECTION 1: Health ─────────────────────────────────────────────────────────
async function testHealth() {
  console.log('\n━━━ 1. BACKEND HEALTH ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  await check('GET /api/health', async () => {
    const res = await fetch(`${BASE}/health`);
    const d = await res.json();
    return { pass: res.ok && d.status === 'OK', detail: d.message };
  });
}

// ─── SECTION 2: Authentication for all roles ───────────────────────────────────
async function testAuth() {
  console.log('\n━━━ 2. AUTHENTICATION — ALL ROLES ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  for (const { email, role, code } of ROLES) {
    await check(`GET /api/me [${role}]`, async () => {
      const { ok, data } = await hit('GET', '/me', null, email);
      const gotRole = data.profile?.user_role;
      const gotCode = data.profile?.operator_code;
      const pass = ok && gotRole === role && gotCode === code;
      return { pass, detail: `role=${gotRole} code=${gotCode} approved=${data.profile?.is_approved}` };
    });
  }
}

// ─── SECTION 3: Incidents ──────────────────────────────────────────────────────
async function testIncidents() {
  console.log('\n━━━ 3. INCIDENTS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  const email = 'dispatcher@eaws.gov.gh';

  let incidentId = 'INC-8829-X';

  await check('GET /api/incidents/live', async () => {
    const { ok, data } = await hit('GET', '/incidents/live', null, email);
    const count = data.incidents?.length ?? 0;
    if (count > 0) incidentId = data.incidents[0].id;
    return { pass: ok && count > 0, detail: `${count} incident(s) returned` };
  });

  await check('GET /api/incidents/feed', async () => {
    const { ok, data } = await hit('GET', '/incidents/feed', null, email);
    return { pass: ok && Array.isArray(data.incidents), detail: `${data.incidents?.length ?? 0} incident(s)` };
  });

  await check(`GET /api/incidents/:id [${incidentId}]`, async () => {
    const { ok, data } = await hit('GET', `/incidents/${incidentId}`, null, email);
    return { pass: ok && data.incident?.id === incidentId, detail: `title: ${data.incident?.title}` };
  });

  await check('PATCH /api/incidents/:id/triage', async () => {
    const { ok, data } = await hit('PATCH', `/incidents/${incidentId}/triage`, { severity: 'CRITICAL', status: 'assigned' }, email);
    return { pass: ok && data.success, detail: `severity=${data.incident?.severity} status=${data.incident?.status}` };
  });

  await check('POST /api/incidents/:id/dispatch [police]', async () => {
    const { ok, data } = await hit('POST', `/incidents/${incidentId}/dispatch`, { agency_type: 'police', notes: 'E2E test dispatch' }, email);
    return { pass: ok && data.success, detail: `response id=${data.response?.id} agency=${data.response?.agency}` };
  });

  await check('POST /api/incidents/:id/dispatch [ambulance]', async () => {
    const { ok, data } = await hit('POST', `/incidents/${incidentId}/dispatch`, { agency_type: 'ambulance', notes: 'E2E ambulance' }, email);
    return { pass: ok && data.success, detail: `agency=${data.response?.agency} status=${data.response?.status}` };
  });

  await check('POST /api/incidents (create general)', async () => {
    const { ok, data } = await hit('POST', '/incidents', {
      title: 'E2E Test Incident',
      category: 'fire',
      description: 'Created by automated test',
      latitude: 5.6037,
      longitude: -0.1870,
      location_name: 'Test Location, Accra',
      severity: 'HIGH',
    }, email);
    return { pass: ok && data.success, detail: `id=${data.incident?.id}` };
  });
}

// ─── SECTION 4: Units ─────────────────────────────────────────────────────────
async function testUnits() {
  console.log('\n━━━ 4. UNITS & AGENCIES ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  const email = 'dispatcher@eaws.gov.gh';

  await check('GET /api/units/live', async () => {
    const { ok, data } = await hit('GET', '/units/live', null, email);
    const count = data.units?.length ?? 0;
    const types = [...new Set(data.units?.map(u => u.agency_type) ?? [])];
    return { pass: ok && count > 0, detail: `${count} unit(s) — types: ${types.join(', ')}` };
  });

  // Test that all agency types are present
  await check('Units cover all 3 agency types (police/fire/ambulance)', async () => {
    const { ok, data } = await hit('GET', '/units/live', null, email);
    const types = new Set(data.units?.map(u => u.agency_type) ?? []);
    const pass = types.has('police') && types.has('fire') && types.has('ambulance');
    return { pass, detail: `Found: ${[...types].join(', ')}` };
  });
}

// ─── SECTION 5: Alerts ────────────────────────────────────────────────────────
async function testAlerts() {
  console.log('\n━━━ 5. ALERTS / BROADCAST ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  const email = 'admin@eaws.gov.gh';

  await check('GET /api/alerts/active', async () => {
    const { ok, data } = await hit('GET', '/alerts/active', null, email);
    return { pass: ok && Array.isArray(data.alerts), detail: `${data.alerts?.length ?? 0} active alert(s)` };
  });
}

// ─── SECTION 6: Community ─────────────────────────────────────────────────────
async function testCommunity() {
  console.log('\n━━━ 6. COMMUNITY FEED ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  const email = 'police@eaws.gov.gh';
  const incidentId = 'INC-8829-X';

  await check('POST /api/community/incidents/:id/comments', async () => {
    // Mount is /api/community so we call relative to that
    const opts = {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token(email)}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'Automated test comment' }),
      signal: AbortSignal.timeout(5000)
    };
    const res = await fetch(`http://127.0.0.1:5001/api/community/incidents/${incidentId}/comments`, opts);
    const data = await res.json();
    return { pass: res.ok && data.success, detail: `comment id=${data.comment?.id || 'mocked'}` };
  });
}

// ─── SECTION 7: Frontend Pages ────────────────────────────────────────────────
async function testFrontend() {
  console.log('\n━━━ 7. FRONTEND PAGES (Next.js) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  const pages = ['/', '/dashboard', '/police', '/ambulance', '/fire', '/admin', '/citizen'];
  // Use 127.0.0.1 explicitly — on macOS, 'localhost' resolves to ::1 (IPv6)
  // but Next.js dev only listens on IPv4 by default
  const FRONTEND_IP = 'http://127.0.0.1:3000';

  for (const page of pages) {
    await check(`GET ${page}`, async () => {
      const res = await fetch(`${FRONTEND_IP}${page}`, { signal: AbortSignal.timeout(5000) });
      const text = await res.text();
      const hasSentinel = text.includes('Sentinel') || text.includes('EAWS') || text.includes('html');
      return {
        pass: res.ok && hasSentinel,
        detail: `HTTP ${res.status} — ${res.ok ? 'page rendered OK' : 'unexpected response'}`
      };
    });
  }
}

// ─── SECTION 8: Security sanity check ─────────────────────────────────────────
async function testSecurity() {
  console.log('\n━━━ 8. SECURITY CHECKS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  await check('Request with NO token → 401 Unauthorized', async () => {
    const res = await fetch(`${BASE}/me`);
    return { pass: res.status === 401, detail: `Got HTTP ${res.status}` };
  });

  await check('Request with INVALID token → 401 Unauthorized', async () => {
    const res = await fetch(`${BASE}/me`, { headers: { Authorization: 'Bearer totally-invalid-garbage-token' } });
    return { pass: res.status === 401, detail: `Got HTTP ${res.status}` };
  });

  await check('Request with EMPTY bearer → 401', async () => {
    const res = await fetch(`${BASE}/me`, { headers: { Authorization: 'Bearer ' } });
    return { pass: res.status === 401, detail: `Got HTTP ${res.status}` };
  });
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║     EAWS SENTINEL COMMAND — FULL E2E TEST SUITE                 ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝');

  await testHealth();
  await testAuth();
  await testIncidents();
  await testUnits();
  await testAlerts();
  await testCommunity();
  await testFrontend();
  await testSecurity();

  const total = passed + failed;
  console.log('\n╔══════════════════════════════════════════════════════════════════╗');
  console.log(`║  RESULTS: ${passed}/${total} passed   ${failed} failed                              ║`);
  console.log('╚══════════════════════════════════════════════════════════════════╝');

  if (failed === 0) {
    console.log('\n🎉 ALL TESTS PASSED — Sentinel Command is fully operational!\n');
  } else {
    console.log(`\n⚠️  ${failed} test(s) failed — review above for details.\n`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('\n💥 Test suite crashed:', err.message);
  process.exit(1);
});
