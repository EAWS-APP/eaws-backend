const { supabaseAdmin } = require('../config/supabase');
const { resolveAuthorName, mockProfiles, mockProfilesByEmail } = require('../routes/mockDb');

async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'Missing bearer token',
    });
  }

  // Check for mock token fallback
  if (token.startsWith('mock-token-')) {
    const email = token.slice(11);
    let role = 'citizen';
    let code = 'GH-ACR-5501-21';
    let agency = null;

    if (email.startsWith('police')) { role = 'police'; code = 'POL-0021'; agency = 'police'; }
    else if (email.startsWith('fire')) { role = 'fire'; code = 'GNFS-0012'; agency = 'fire'; }
    else if (email.startsWith('ambulance')) { role = 'ambulance'; code = 'AMB-0003'; agency = 'ambulance'; }
    else if (email.startsWith('admin')) { role = 'admin'; code = 'ADMIN-001'; }
    else if (email.startsWith('dispatcher')) { role = 'dispatcher'; code = 'DISP-0001'; }

    // Look up the user by email in the registry for full profile resolution
    const registryProfile = mockProfilesByEmail[email.toLowerCase()] || mockProfiles[`mock-id-${role}`];
    const userId = registryProfile ? registryProfile.user_id : `mock-id-${role}`;
    const name = (registryProfile && registryProfile.full_name) || resolveAuthorName({ id: userId, email, user_metadata: {} });
    const resolvedCode = (registryProfile && registryProfile.operator_code) || code;
    const resolvedRole = (registryProfile && registryProfile.user_role) || role;

    req.isOfflineMock = true;
    req.authUser = {
      id: userId,
      email,
      user_metadata: {
        full_name: name,
        role: resolvedRole,
        operator_code: resolvedCode,
        agency_type: agency
      }
    };
    return next();
  }

  try {
    const { data, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !data.user) {
      throw error || new Error('Invalid Supabase token');
    }

    // Enrich user with resolved name from registry
    const resolvedName = resolveAuthorName(data.user);
    if (!data.user.user_metadata) data.user.user_metadata = {};
    if (!data.user.user_metadata.full_name || data.user.user_metadata.full_name === 'Ghana Citizen') {
      data.user.user_metadata.full_name = resolvedName;
    }

    req.authUser = data.user;
    return next();
  } catch (err) {
    console.warn('⚠️ Supabase Auth offline. Resolving identity from registry.');
    let email = 'citizen@eaws.gov.gh';
    if (token.includes('police')) email = 'police@eaws.gov.gh';
    else if (token.includes('fire')) email = 'fire@eaws.gov.gh';
    else if (token.includes('ambulance')) email = 'ambulance@eaws.gov.gh';
    else if (token.includes('admin')) email = 'admin@eaws.gov.gh';
    else if (token.includes('dispatcher')) email = 'dispatcher@eaws.gov.gh';

    let role = 'citizen';
    let code = 'GH-ACR-5501-21';
    let agency = null;

    if (email.startsWith('police')) { role = 'police'; code = 'POL-0021'; agency = 'police'; }
    else if (email.startsWith('fire')) { role = 'fire'; code = 'GNFS-0012'; agency = 'fire'; }
    else if (email.startsWith('ambulance')) { role = 'ambulance'; code = 'AMB-0003'; agency = 'ambulance'; }
    else if (email.startsWith('admin')) { role = 'admin'; code = 'ADMIN-001'; }
    else if (email.startsWith('dispatcher')) { role = 'dispatcher'; code = 'DISP-0001'; }

    const tentativeUser = { id: `mock-id-${role}`, email, user_metadata: {} };
    const registryProfile = mockProfiles[`mock-id-${role}`] || mockProfilesByEmail[email.toLowerCase()];
    const name = (registryProfile && registryProfile.full_name) || resolveAuthorName(tentativeUser);

    req.isOfflineMock = true;
    req.authUser = {
      id: `mock-id-${role}`,
      email,
      user_metadata: { full_name: name, role, operator_code: code, agency_type: agency }
    };
    return next();
  }
}

async function attachProfile(req, res, next) {
  if (!req.authUser) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required before attaching profile',
    });
  }

  // Fast-path: mock/offline session — build profile from auth metadata, no DB call
  if (req.isOfflineMock) {
    const meta = req.authUser.user_metadata || {};
    req.userProfile = {
      user_id:       req.authUser.id,
      user_role:     meta.role || 'citizen',
      operator_code: meta.operator_code || null,
      agency_type:   meta.agency_type || null,
      is_approved:   true,
      is_active:     true,
      full_name:     meta.full_name || null,
    };
    return next();
  }

  try {
    const { data: profile, error } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('user_id', req.authUser.id)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 is no rows returned
      throw error;
    }

    req.userProfile = profile || {
      user_id: req.authUser.id,
      user_role: 'citizen',
      is_approved: true,
      is_active: true,
    };

    // Block inactive or unapproved accounts
    if (!req.userProfile.is_approved || !req.userProfile.is_active) {
      return res.status(403).json({
        success: false,
        error: 'Account is pending approval or has been deactivated.',
      });
    }

    return next();
  } catch (error) {
    // Supabase offline — synthesize a minimal profile from token metadata
    console.warn('\u26a0\ufe0f Supabase offline in attachProfile, using metadata fallback.');
    const meta = req.authUser.user_metadata || {};
    req.userProfile = {
      user_id:       req.authUser.id,
      user_role:     meta.role || 'citizen',
      operator_code: meta.operator_code || null,
      agency_type:   meta.agency_type || null,
      is_approved:   true,
      is_active:     true,
      full_name:     meta.full_name || null,
    };
    return next();
  }
}

function requireRole(allowedRole) {
  return [
    requireAuth,
    attachProfile,
    (req, res, next) => {
      const role = req.userProfile.user_role;
      if (role !== allowedRole && role !== 'super_admin' && role !== 'admin') {
        return res.status(403).json({
          success: false,
          error: `Access denied. Requiring role: ${allowedRole}`,
        });
      }
      return next();
    },
  ];
}

function requireAnyRole(allowedRoles) {
  return [
    requireAuth,
    attachProfile,
    (req, res, next) => {
      const role = req.userProfile.user_role;
      if (!allowedRoles.includes(role) && role !== 'super_admin' && role !== 'admin') {
        return res.status(403).json({
          success: false,
          error: `Access denied. Requiring one of: ${allowedRoles.join(', ')}`,
        });
      }
      return next();
    },
  ];
}

module.exports = {
  requireAuth,
  attachProfile,
  requireRole,
  requireAnyRole,
};

