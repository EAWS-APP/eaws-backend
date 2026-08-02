require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  const incidentId = '78c8feac-17e5-46f2-9d66-fe03d9d3eff9'; // Real incident ID
  
  // Try inserting with columns from responses.js: incident_id, agency, dispatched_by, status
  console.log('Testing responses.js columns (incident_id, agency, status, dispatched_by)...');
  const payload1 = {
    incident_id: incidentId,
    agency: 'police',
    status: 'assigned',
    dispatched_by: '8ada95ac-12f3-44e8-9239-fbc24d83bd40' // known user_id
  };
  const { data: res1, error: err1 } = await admin.from('responses').insert(payload1).select();
  if (err1) {
    console.log('❌ responses.js payload failed:', err1.message);
  } else {
    console.log('✅ responses.js payload succeeded!', res1);
    // Cleanup
    await admin.from('responses').delete().eq('incident_id', incidentId);
    return;
  }

  // Try inserting with columns from incidents.js: incident_id, agency_id, unit_id, status, remarks
  console.log('\nTesting incidents.js columns (incident_id, agency_id, unit_id, status, remarks)...');
  const payload2 = {
    incident_id: incidentId,
    agency_id: '45e50538-a962-4af9-9edd-8c857768f843', // police agency
    status: 'dispatched',
    remarks: 'test dispatch'
  };
  const { data: res2, error: err2 } = await admin.from('responses').insert(payload2).select();
  if (err2) {
    console.log('❌ incidents.js payload failed:', err2.message);
  } else {
    console.log('✅ incidents.js payload succeeded!', res2);
    // Cleanup
    await admin.from('responses').delete().eq('incident_id', incidentId);
    return;
  }
}

main().catch(console.error);
