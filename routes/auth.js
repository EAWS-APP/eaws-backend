const express = require('express');
const { supabasePublic, supabaseAdmin } = require('../config/insforge');
const { requireAuth, attachProfile } = require('../middleware/auth');

const router = express.Router();

// Helper to generate 8-character alphanumeric code
function generateAlphanumericCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removed confusing chars like I, 1, O, 0
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

router.post('/auth/signup', async (req, res, next) => {
  try {
    const { email, password, phone, metadata = {} } = req.body;

    if ((!email && !phone) || !password) {
      return res.status(400).json({
        success: false,
        error: 'Provide email or phone, plus password',
      });
    }

    // 1. Create the user using Supabase Admin Client (email confirmed to prevent generic email)
    const { data: userData, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: email || undefined,
      phone: phone || undefined,
      password: password,
      email_confirm: true, // Prevents Supabase from sending generic confirmation link
      phone_confirm: true,
      user_metadata: {
        ...metadata,
        full_name: metadata.full_name || '',
        phone_number: phone,
        is_approved: false, // Forces user to go through verification screen first
      }
    });

    if (createError) throw createError;

    // 2. Generate custom OTP code & Expiration
    const otpCode = generateAlphanumericCode();
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 15); // 15 mins expiration

    // 3. Save custom OTP to database
    const identifier = email || phone;
    const { error: dbError } = await supabaseAdmin
      .from('custom_otps')
      .insert({
        identifier,
        otp_code: otpCode,
        type: 'signup',
        expires_at: expiresAt.toISOString(),
      });

    if (dbError) throw dbError;

    // 4. Write mock email to logs/emails.log
    const fs = require('fs');
    const path = require('path');
    const logsDir = path.join(__dirname, '../logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    const logFilePath = path.join(logsDir, 'emails.log');
    const timestamp = new Date().toISOString();
    const emailContent = `[${timestamp}] [MOCK EMAIL] Sending to ${identifier}: Your EAWS verification code is: ${otpCode}. Please enter this in the app.\n`;
    fs.appendFileSync(logFilePath, emailContent);

    console.log(`[MOCK EMAIL] Sending to ${identifier}: Your EAWS verification code is: ${otpCode}`);

    // 5. Send real email via SendGrid if email is provided
    if (email) {
      try {
        const sendgridApiKey = process.env.SENDGRID_API_KEY;
        const fromEmail = process.env.SENDGRID_FROM_EMAIL || 'trojanmurderer1@gmail.com';
        
        if (sendgridApiKey) {
          console.log(`[SendGrid] Attempting to send verification email to ${email}...`);
          const sgResponse = await fetch('https://api.sendgrid.com/v3/mail/send', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${sendgridApiKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              personalizations: [
                {
                  to: [{ email }]
                }
              ],
              from: {
                email: fromEmail,
                name: 'EAWS'
              },
              subject: 'Your EAWS Verification Code',
              content: [
                {
                  type: 'text/html',
                  value: `
                    <div style="font-family: sans-serif; padding: 24px; max-width: 600px; margin: auto; background-color: #0a0a0a; border: 1px solid #262626; border-radius: 12px; color: #e5e5e5;">
                      <div style="text-align: center; margin-bottom: 24px;">
                        <span style="color: #dc2626; font-size: 24px; font-weight: bold; letter-spacing: 2px;">EAWS CONTROL</span>
                      </div>
                      <h2 style="color: #ffffff; text-align: center; margin-bottom: 8px;">Verify Your Email Address</h2>
                      <p style="text-align: center; color: #a3a3a3; font-size: 16px; margin-bottom: 24px;">Enter the 8-character confirmation code below to activate your account.</p>
                      <div style="background-color: #171717; border: 1px solid #404040; border-radius: 8px; padding: 16px; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #dc2626; font-family: monospace; margin-bottom: 24px;">
                        ${otpCode}
                      </div>
                      <p style="font-size: 12px; color: #737373; text-align: center;">This code is valid for 15 minutes. If you did not request this code, please ignore this email.</p>
                      <hr style="border: 0; border-top: 1px solid #262626; margin: 24px 0;" />
                      <p style="font-size: 11px; color: #525252; text-align: center; margin: 0;">Protected by the Data Protection Act 2012 (Ghana)</p>
                      <p style="font-size: 11px; color: #525252; text-align: center; margin: 4px 0 0 0;">Unauthorized access is strictly prohibited.</p>
                    </div>
                  `
                }
              ]
            })
          });

          if (!sgResponse.ok) {
            const sgErrorText = await sgResponse.text();
            console.error('[SendGrid] SendGrid Error details:', sgErrorText);
          } else {
            console.log(`[SendGrid] Verification email successfully sent to ${email}`);
          }
        } else {
          console.warn('[SendGrid] SENDGRID_API_KEY is not set. Skipping real email dispatch.');
        }
      } catch (err) {
        console.error('[SendGrid] Failed to send email via SendGrid:', err.message);
      }
    }

    return res.status(201).json({
      success: true,
      user: userData.user,
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/auth/signin', async (req, res, next) => {
  try {
    const { email, phone, password } = req.body;

    if ((!email && !phone) || !password) {
      return res.status(400).json({
        success: false,
        error: 'Provide email or phone, plus password',
      });
    }

    const { data, error } = await supabasePublic.auth.signInWithPassword({
      email,
      phone,
      password,
    });

    if (error) throw error;

    return res.json({
      success: true,
      user: data.user,
      session: data.session,
    });
  } catch (error) {
    return next(error);
  }
});

function getPermissionsForRole(role) {
  const commonOps = [
    'view_assigned_incidents',
    'acknowledge_assignment',
    'update_response_status',
  ];

  switch (role) {
    case 'super_admin':
    case 'admin':
      return [
        ...commonOps,
        'manage_users',
        'approve_operators',
        'view_audit_logs',
        'manage_agencies',
        'manage_units',
        'create_alerts',
        'manage_safe_zones',
      ];
    case 'dispatcher':
      return [
        ...commonOps,
        'triage_incidents',
        'assign_agencies',
        'create_alerts',
      ];
    case 'nadmo':
      return [
        ...commonOps,
        'manage_safe_zones',
        'create_alerts',
      ];
    case 'police':
    case 'ambulance':
    case 'fire':
      return commonOps;
    case 'citizen':
    default:
      return [
        'create_incidents',
        'view_verified_incidents',
        'comment_react',
      ];
  }
}

router.get('/me', requireAuth, attachProfile, async (req, res) => {
  const role = req.userProfile.user_role;
  return res.json({
    success: true,
    user: req.authUser,
    profile: req.userProfile,
    permissions: getPermissionsForRole(role),
  });
});

// Alias path to maintain compatibility if any component calls /auth/me
router.get('/auth/me', requireAuth, attachProfile, async (req, res) => {
  const role = req.userProfile.user_role;
  return res.json({
    success: true,
    user: req.authUser,
    profile: req.userProfile,
    permissions: getPermissionsForRole(role),
  });
});

// Programmatically confirm a user's email upon mock OTP verification
router.post('/auth/verify-email', async (req, res, next) => {
  try {
    const { email, code } = req.body;
    if (!email || !code) {
      return res.status(400).json({ success: false, error: 'Email and code are required' });
    }

    if (code.length !== 8) {
      return res.status(400).json({ success: false, error: 'Verification code must be exactly 8 characters' });
    }

    // 1. Verify the OTP in the custom_otps table
    const { data: otpRecord, error: fetchError } = await supabaseAdmin
      .from('custom_otps')
      .select('*')
      .eq('identifier', email)
      .eq('otp_code', code)
      .eq('type', 'signup')
      .eq('used', false)
      .gte('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (fetchError || !otpRecord) {
      return res.status(400).json({ success: false, error: 'Invalid or expired verification code' });
    }

    // 2. Mark OTP as used
    const { error: updateOtpError } = await supabaseAdmin
      .from('custom_otps')
      .update({ used: true })
      .eq('id', otpRecord.id);

    if (updateOtpError) throw updateOtpError;

    // 3. Retrieve auth users list to find the ID
    const { data: { users }, error: listError } = await supabaseAdmin.auth.admin.listUsers();
    if (listError) throw listError;

    const user = users.find(u => u.email === email);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User email not found' });
    }

    // 4. Programmatically confirm the email
    const { error: confirmError } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
      email_confirmed_at: new Date().toISOString()
    });

    if (confirmError) throw confirmError;

    // 5. Update profiles table to set is_approved = true
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({ is_approved: true })
      .eq('user_id', user.id);

    if (profileError) throw profileError;

    return res.json({ success: true, message: 'Email confirmed and account activated!' });
  } catch (error) {
    return next(error);
  }
});

// Block user
router.post('/admin/users/:userId/block', requireAuth, async (req, res, next) => {
  try {
    const role = req.authUser.user_metadata?.role || 'citizen';
    const isOperator = ['dispatcher', 'police', 'fire', 'ambulance', 'admin'].includes(role);
    if (!isOperator) {
      return res.status(403).json({ success: false, error: 'Unauthorized to block users' });
    }

    const { userId } = req.params;
    const { mockProfiles } = require('./mockDb');

    // In-memory mock fallback
    if (req.isOfflineMock) {
      if (mockProfiles[userId]) {
        mockProfiles[userId].is_active = false;
      }
      return res.json({ success: true, message: 'User blocked' });
    }

    // Supabase
    const { error } = await supabaseAdmin
      .from('profiles')
      .update({ is_active: false })
      .eq('user_id', userId);

    if (error) throw error;
    return res.json({ success: true, message: 'User blocked' });
  } catch (error) {
    return next(error);
  }
});

// Unblock user
router.post('/admin/users/:userId/unblock', requireAuth, async (req, res, next) => {
  try {
    const role = req.authUser.user_metadata?.role || 'citizen';
    const isOperator = ['dispatcher', 'police', 'fire', 'ambulance', 'admin'].includes(role);
    if (!isOperator) {
      return res.status(403).json({ success: false, error: 'Unauthorized to unblock users' });
    }

    const { userId } = req.params;
    const { mockProfiles } = require('./mockDb');

    // In-memory mock fallback
    if (req.isOfflineMock) {
      if (mockProfiles[userId]) {
        mockProfiles[userId].is_active = true;
      }
      return res.json({ success: true, message: 'User unblocked' });
    }

    // Supabase
    const { error } = await supabaseAdmin
      .from('profiles')
      .update({ is_active: true })
      .eq('user_id', userId);

    if (error) throw error;
    return res.json({ success: true, message: 'User unblocked' });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;

