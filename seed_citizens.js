require('dotenv').config();
const { supabaseAdmin } = require('./config/supabase');

const CITIZENS = [
  {
    email: 'dharrison@gmail.com',
    password: 'Password123!',
    phone: '+233548829912',
    profile: {
      full_name: 'D. Harrison',
      user_role: 'citizen',
      operator_code: 'GH-ACR-8829-44',
      is_approved: true,
      is_active: true,
    }
  },
  {
    email: 'amaboateng@gmail.com',
    password: 'Password123!',
    phone: '+233201112233',
    profile: {
      full_name: 'Ama Serwaa Boateng',
      user_role: 'citizen',
      operator_code: 'GH-ACR-7723-09',
      is_approved: true,
      is_active: true,
    }
  },
  {
    email: 'kwameasante@gmail.com',
    password: 'Password123!',
    phone: '+233245557788',
    profile: {
      full_name: 'Kwame Asante',
      user_role: 'citizen',
      operator_code: 'GH-ACR-5501-21',
      is_approved: true,
      is_active: true,
    }
  },
  {
    email: 'abenaosei@gmail.com',
    password: 'Password123!',
    phone: '+233274568801',
    profile: {
      full_name: 'Abena Osei-Bonsu',
      user_role: 'citizen',
      operator_code: 'GH-ACR-1189-44',
      is_approved: true,
      is_active: true,
    }
  },
  {
    email: 'ghanacitizen@gmail.com',
    password: 'Password123!',
    phone: '+233200000001',
    profile: {
      full_name: 'Ghana Citizen (Default)',
      user_role: 'citizen',
      operator_code: 'GH-ACR-0000-01',
      is_approved: true,
      is_active: true,
    }
  },
  {
    email: 'nanamensah@gmail.com',
    password: 'Password123!',
    phone: '+233509091010',
    profile: {
      full_name: 'Nana Mensah',
      user_role: 'citizen',
      operator_code: 'GH-ACR-3312-17',
      is_approved: false,
      is_active: true,
    }
  }
];

async function seedCitizens() {
  console.log('Syncing Citizen Auth users and profiles with Supabase...');
  const { data: profiles, error: profErr } = await supabaseAdmin.from('profiles').select('*');
  if (profErr) {
    console.error('Error fetching profiles:', profErr);
    process.exit(1);
  }

  const { data: { users }, error: listError } = await supabaseAdmin.auth.admin.listUsers();
  if (listError) {
    console.error('Error listing users:', listError);
    process.exit(1);
  }

  for (const citizen of CITIZENS) {
    // Match profile by operator code or full name
    const matchProf = profiles.find(p => p.operator_code === citizen.profile.operator_code || p.full_name === citizen.profile.full_name);
    let userId;

    if (matchProf) {
      userId = matchProf.user_id;
      console.log(`Updating existing auth user (${matchProf.full_name}) -> ${citizen.email}...`);
      await supabaseAdmin.auth.admin.updateUserById(userId, {
        email: citizen.email,
        password: citizen.password,
        email_confirm: true,
        user_metadata: {
          full_name: citizen.profile.full_name,
          is_approved: citizen.profile.is_approved,
        }
      });
    } else {
      console.log(`Creating new auth user: ${citizen.email}...`);
      const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email: citizen.email,
        password: citizen.password,
        email_confirm: true,
        user_metadata: {
          full_name: citizen.profile.full_name,
          is_approved: citizen.profile.is_approved,
        }
      });

      if (createError) {
        console.error(`Failed to create ${citizen.email}:`, createError);
        continue;
      }
      userId = newUser.user.id;
    }

    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .upsert({
        user_id: userId,
        ...citizen.profile,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' });

    if (profileError) {
      console.error(`Profile sync error for ${citizen.email}:`, profileError);
    } else {
      console.log(`✅ Profile successfully synced for ${citizen.profile.full_name} (${citizen.email})`);
    }
  }
  console.log('🚀 Citizen seeding completed!');
}

seedCitizens();
