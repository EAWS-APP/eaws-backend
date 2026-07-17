require('dotenv').config();
const { supabaseAdmin } = require('./config/supabase');

async function run() {
  const email = 'trojanmurderer1@gmail.com';
  console.log(`Searching for user: ${email}...`);

  const { data: { users }, error: listError } = await supabaseAdmin.auth.admin.listUsers();
  if (listError) {
    console.error('List users error:', listError);
    process.exit(1);
  }

  const user = users.find(u => u.email === email);
  if (!user) {
    console.error('User not found!');
    process.exit(1);
  }

  console.log(`Found user: ${user.id}. Confirming email...`);
  const { data, error } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
    email_confirmed_at: new Date().toISOString()
  });

  if (error) {
    console.error('Confirm error:', error);
  } else {
    console.log('Email confirmed successfully!');
  }
}

run();
