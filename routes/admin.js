const express = require('express');
const fs = require('fs');
const path = require('path');
const { supabaseAdmin } = require('../config/insforge');
const { requireAnyRole } = require('../middleware/auth');

const router = express.Router();

// Helper to generate a random 4 digit string
function generateCodeSuffix() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

// Ensure the logs directory exists
const LOGS_DIR = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}
const EMAIL_LOG_PATH = path.join(LOGS_DIR, 'emails.log');

// Get all users (Auth + Profiles merged)
router.get('/admin/users', requireAnyRole(['admin', 'super_admin']), async (req, res, next) => {
  try {
    const { data: { users: authUsers }, error: authError } = await supabaseAdmin.auth.admin.listUsers();
    if (authError) throw authError;

    const { data: profiles, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (profileError) throw profileError;

    // Merge authentication emails/phones with profiles
    const merged = (profiles || []).map((profile) => {
      const authUser = (authUsers || []).find(u => u.id === profile.user_id);
      return {
        ...profile,
        email: authUser ? authUser.email : 'Unknown email',
        phone: authUser ? (authUser.phone || authUser.user_metadata?.phone_number) : profile.phone_number,
      };
    });

    return res.json({ success: true, users: merged });
  } catch (error) {
    return next(error);
  }
});

// Promote a citizen to an operational role
router.patch('/admin/users/:userId/promote', requireAnyRole(['admin', 'super_admin']), async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { role, agency_type } = req.body;

    const allowedRoles = ['police', 'ambulance', 'fire', 'nadmo', 'dispatcher'];
    if (!role || !allowedRoles.includes(role.toLowerCase())) {
      return res.status(400).json({
        success: false,
        error: `Invalid role. Must be one of: ${allowedRoles.join(', ')}`,
      });
    }

    // Fetch existing profile to check if a code is already assigned
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (profileError || !profile) {
      return res.status(404).json({ success: false, error: 'User profile not found' });
    }

    // Get Auth User details for the email log
    const { data: authUser, error: authUserError } = await supabaseAdmin.auth.admin.getUserById(userId);
    if (authUserError || !authUser.user) {
      return res.status(404).json({ success: false, error: 'Auth user not found' });
    }
    const userEmail = authUser.user.email;

    // Resolve or generate code suffix
    let code = profile.operator_code;
    if (!code) {
      const suffix = generateCodeSuffix();
      switch (role.toLowerCase()) {
        case 'police':
          code = `POL-${suffix}`;
          break;
        case 'ambulance':
          code = `AMB-${suffix}`;
          break;
        case 'fire':
          code = `FIRE-${suffix}`;
          break;
        case 'nadmo':
          code = `NAD-${suffix}`;
          break;
        case 'dispatcher':
          code = `DISP-${suffix}`;
          break;
      }
    }

    const updates = {
      user_role: role.toLowerCase(),
      operator_code: code,
      agency_type: agency_type || role.toLowerCase(),
      is_approved: true,
      is_active: true,
      updated_at: new Date().toISOString(),
    };

    const { data: updatedProfile, error: updateError } = await supabaseAdmin
      .from('profiles')
      .update(updates)
      .eq('user_id', userId)
      .select('*')
      .single();

    if (updateError) throw updateError;

    // Simulate sending automated promotion email (Log to file)
    const emailSubject = `EAWS Official Promotion Notice - ${role.toUpperCase()}`;
    const emailBody = `
=========================================
EMAIL TO: ${userEmail}
SUBJECT: ${emailSubject}
TIMESTAMP: ${new Date().toISOString()}
-----------------------------------------
Hello ${profile.full_name || 'Operator'},

Congratulations! Your EAWS account has been verified and elevated to the operational role of: ${role.toUpperCase()}.

You can now log in to your designated operational dashboard using:
- Email: ${userEmail}
- Password: (Your existing password)
- Security Code / Badge ID: ${code}

Please safeguard this security code. Do not share it with unauthorized personnel.

Stay alert. Save lives.
- EAWS Administration
=========================================
`;

    fs.appendFileSync(EMAIL_LOG_PATH, emailBody);
    console.log(`Automated promotion email logged for ${userEmail}`);

    // Send real email via SendGrid if email is available and API key is set
    if (userEmail) {
      try {
        const sendgridApiKey = process.env.SENDGRID_API_KEY;
        const fromEmail = process.env.SENDGRID_FROM_EMAIL || 'trojanmurderer1@gmail.com';
        
        if (sendgridApiKey) {
          console.log(`[SendGrid] Attempting to send promotion notice email to ${userEmail}...`);
          const sgResponse = await fetch('https://api.sendgrid.com/v3/mail/send', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${sendgridApiKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              personalizations: [
                {
                  to: [{ email: userEmail }]
                }
              ],
              from: {
                email: fromEmail,
                name: 'EAWS'
              },
              subject: `EAWS Official Promotion Notice - ${role.toUpperCase()}`,
              content: [
                {
                  type: 'text/html',
                  value: `
                    <div style="font-family: sans-serif; padding: 24px; max-width: 600px; margin: auto; background-color: #0a0a0a; border: 1px solid #262626; border-radius: 12px; color: #e5e5e5;">
                      <div style="text-align: center; margin-bottom: 24px;">
                        <span style="color: #dc2626; font-size: 24px; font-weight: bold; letter-spacing: 2px;">EAWS CONTROL</span>
                      </div>
                      <h2 style="color: #ffffff; text-align: center; margin-bottom: 8px;">Official Promotion Notice</h2>
                      <p style="text-align: center; color: #a3a3a3; font-size: 16px; margin-bottom: 24px;">
                        Congratulations ${profile.full_name || 'Operator'}, your account has been verified and elevated to the operational role of: <strong>${role.toUpperCase()}</strong>.
                      </p>
                      <div style="background-color: #171717; border: 1px solid #262626; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
                        <p style="margin: 0 0 12px 0; font-size: 14px; color: #a3a3a3;">You can now log in to your designated operational dashboard using these credentials:</p>
                        <table style="width: 100%; font-size: 14px; color: #ffffff;">
                          <tr>
                            <td style="padding: 4px 0; color: #737373; width: 120px;">Role:</td>
                            <td style="padding: 4px 0; font-weight: bold;">${role.toUpperCase()}</td>
                          </tr>
                          <tr>
                            <td style="padding: 4px 0; color: #737373;">Email:</td>
                            <td style="padding: 4px 0; font-weight: bold;">${userEmail}</td>
                          </tr>
                          <tr>
                            <td style="padding: 4px 0; color: #737373;">Security Code:</td>
                            <td style="padding: 4px 0; font-weight: bold; color: #dc2626; font-family: monospace; font-size: 16px; letter-spacing: 1px;">${code}</td>
                          </tr>
                        </table>
                      </div>
                      <p style="font-size: 12px; color: #737373; text-align: center;">Please safeguard this security code. Do not share it with unauthorized personnel.</p>
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
            console.error('[SendGrid] Promotion Email Error details:', sgErrorText);
          } else {
            console.log(`[SendGrid] Promotion notice email successfully sent to ${userEmail}`);
          }
        } else {
          console.warn('[SendGrid] SENDGRID_API_KEY is not set. Skipping real email dispatch.');
        }
      } catch (err) {
        console.error('[SendGrid] Failed to send promotion email via SendGrid:', err.message);
      }
    }

    // Create Admin Audit Log
    await supabaseAdmin.from('audit_logs').insert({
      actor_id: req.authUser.id,
      action: 'promote_user',
      entity_type: 'profiles',
      entity_id: userId,
      metadata: { target_role: role, operator_code: code, target_email: userEmail },
    });

    return res.json({
      success: true,
      profile: {
        ...updatedProfile,
        email: userEmail,
      },
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
