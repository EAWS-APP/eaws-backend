require('dotenv').config();
const { supabaseAdmin } = require('./config/supabase');

const OPERATORS = [
  {
    email: 'ebenezer@eaws.gov.gh',
    password: 'Staff@2026',
    profile: {
      full_name: 'Ebenezer Ayettey',
      user_role: 'dispatcher',
      operator_code: 'OP-7740',
      agency_type: 'police',
      is_approved: true,
      is_active: true,
    }
  },
  {
    email: 'dispatcher@eaws.gov.gh',
    password: 'Dispatch@2026',
    profile: {
      full_name: 'National Dispatch Center Operator',
      user_role: 'dispatcher',
      operator_code: 'DISP-4920',
      is_approved: true,
      is_active: true,
    }
  },
  {
    email: 'police@eaws.gov.gh',
    password: 'Police@2026',
    profile: {
      full_name: 'Greater Accra Police Unit',
      user_role: 'police',
      operator_code: 'POL-0021',
      agency_type: 'police',
      is_approved: true,
      is_active: true,
    }
  },
  {
    email: 'fire@eaws.gov.gh',
    password: 'Fire@2026',
    profile: {
      full_name: 'Accra Central Fire Station',
      user_role: 'fire',
      operator_code: 'FIRE-119',
      agency_type: 'fire',
      is_approved: true,
      is_active: true,
    }
  },
  {
    email: 'ambulance@eaws.gov.gh',
    password: 'Ambulance@2026',
    profile: {
      full_name: 'National Ambulance Service Unit',
      user_role: 'ambulance',
      operator_code: 'AMB-110',
      agency_type: 'ambulance',
      is_approved: true,
      is_active: true,
    }
  },
  {
    email: 'admin@eaws.gov.gh',
    password: 'Admin@2026',
    profile: {
      full_name: 'System Administrator',
      user_role: 'admin',
      is_approved: true,
      is_active: true,
    }
  }
];

async function seed() {
  console.log('Fetching existing users from Supabase Auth...');
  
  // Retrieve all users to check presence
  const { data: { users }, error: listError } = await supabaseAdmin.auth.admin.listUsers();
  
  if (listError) {
    console.error('Error listing users:', listError);
    process.exit(1);
  }

  for (const op of OPERATORS) {
    console.log(`Processing operator: ${op.email}...`);
    let user = users.find(u => u.email === op.email);
    let userId;

    if (!user) {
      console.log(`Creating auth user: ${op.email}...`);
      const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email: op.email,
        password: op.password,
        email_confirm: true,
        user_metadata: {
          full_name: op.profile.full_name,
          role: 'dispatcher',
          badge_id: op.profile.operator_code,
          agency_type: op.profile.agency_type || 'Central Command'
        }
      });

      if (createError) {
        console.error(`Failed to create ${op.email}:`, createError);
        continue;
      }

      userId = newUser.user.id;
      console.log(`Auth user created. ID: ${userId}`);
    } else {
      userId = user.id;
      console.log(`User already exists. Confirming password and metadata...`);
      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        password: op.password,
        user_metadata: {
          full_name: op.profile.full_name,
          role: 'dispatcher',
          badge_id: op.profile.operator_code,
          agency_type: op.profile.agency_type || 'Central Command'
        }
      });

      if (updateError) {
        console.error(`Failed to update ${op.email}:`, updateError);
      }
    }

    // Now insert/update public.profiles
    console.log(`Upserting profile for user ${userId}...`);
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .upsert({
        user_id: userId,
        ...op.profile,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' });

    if (profileError) {
      console.error(`Failed to upsert profile for ${op.email}:`, profileError);
    } else {
      console.log(`Profile successfully synced for ${op.email}!`);
    }
  }
  
  console.log('Seeding completed.');
}

seed();
