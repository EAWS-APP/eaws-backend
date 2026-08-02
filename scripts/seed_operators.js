/**
 * EAWS Operator Seed Script
 * Creates all test operator accounts in Supabase Auth + profiles table.
 * Run with: node scripts/seed_operators.js
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const PASSWORD = 'password123';

const OPERATORS = [
  { email: 'dispatcher@eaws.gov.gh', role: 'dispatcher', code: 'DISP-0001', agency: null,       name: 'Central Dispatcher' },
  { email: 'police@eaws.gov.gh',     role: 'police',     code: 'POL-0021',  agency: 'police',    name: 'Police Operator'   },
  { email: 'fire@eaws.gov.gh',       role: 'fire',       code: 'GNFS-0012', agency: 'fire',      name: 'Fire Operator'     },
  { email: 'ambulance@eaws.gov.gh',  role: 'ambulance',  code: 'AMB-0003',  agency: 'ambulance', name: 'EMS Operator'      },
  { email: 'admin@eaws.gov.gh',      role: 'admin',      code: 'ADMIN-001', agency: null,        name: 'System Admin'      },
  { email: 'citizen@eaws.gov.gh',    role: 'citizen',    code: null,        agency: null,        name: 'Test Citizen'      },
];

async function upsertUser({ email, role, code, agency, name }) {
  console.log(`\n🔍 Processing: ${email}`);

  // 1. Check if user already exists in Auth
  const { data: listData } = await admin.auth.admin.listUsers();
  const existing = listData?.users?.find(u => u.email === email);

  let userId;

  if (existing) {
    userId = existing.id;
    console.log(`   ✅ Auth user exists: ${userId}`);

    // Update password just to be sure
    const { error: updateErr } = await admin.auth.admin.updateUserById(userId, {
      password: PASSWORD,
      email_confirm: true,
    });
    if (updateErr) {
      console.log(`   ⚠️  Could not update password: ${updateErr.message}`);
    } else {
      console.log(`   🔑 Password reset to: ${PASSWORD}`);
    }
  } else {
    // Create new user
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,   // bypass email confirmation
      user_metadata: {
        full_name: name,
        role,
        operator_code: code,
      },
    });

    if (createErr) {
      console.error(`   ❌ Failed to create auth user: ${createErr.message}`);
      return;
    }

    userId = created.user.id;
    console.log(`   ✅ Auth user created: ${userId}`);
  }

  // 2. Upsert profile row
  const profilePayload = {
    id: userId,
    full_name: name,
    user_role: role,
    operator_code: code || null,
    agency_type: agency || null,
    is_approved: true,
    is_active: true,
  };

  const { error: profileErr } = await admin
    .from('profiles')
    .upsert(profilePayload, { onConflict: 'id' });

  if (profileErr) {
    // If the profiles table uses a different primary key or doesn't exist yet, show a warning
    console.log(`   ⚠️  Profile upsert warning: ${profileErr.message}`);
    console.log(`      (This is OK if your profiles table is auto-created by Supabase triggers)`);
  } else {
    console.log(`   📋 Profile row upserted: role=${role}, code=${code || 'N/A'}`);
  }
}

async function main() {
  console.log('🚀 EAWS Operator Seed Script');
  console.log(`📡 Supabase: ${supabaseUrl}`);
  console.log(`🔐 Password for all accounts: ${PASSWORD}\n`);

  for (const op of OPERATORS) {
    await upsertUser(op);
  }

  console.log('\n\n✅ Done! Operator accounts ready.\n');
  console.log('┌─────────────────────────────────────────────────┐');
  console.log('│ EMAIL                       │ ROLE       │ CODE  │');
  console.log('├─────────────────────────────────────────────────┤');
  OPERATORS.forEach(op => {
    const em = op.email.padEnd(28);
    const rl = op.role.padEnd(10);
    const cd = (op.code || 'N/A').padEnd(10);
    console.log(`│ ${em} │ ${rl} │ ${cd}│`);
  });
  console.log('└─────────────────────────────────────────────────┘');
  console.log(`\nAll passwords: ${PASSWORD}`);
}

main().catch(console.error);
