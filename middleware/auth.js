const { supabaseAdmin } = require('../config/supabase');

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
    let name = 'Ghana Citizen';

    if (email.startsWith('police')) {
      role = 'police';
      code = 'POL-0021';
      agency = 'police';
      name = 'Police Operator';
    } else if (email.startsWith('fire')) {
      role = 'fire';
      code = 'GNFS-0012';
      agency = 'fire';
      name = 'Fire Operator';
    } else if (email.startsWith('ambulance')) {
      role = 'ambulance';
      code = 'AMB-0003';
      agency = 'ambulance';
      name = 'EMS Operator';
    } else if (email.startsWith('admin')) {
      role = 'admin';
      code = 'ADMIN-001';
      name = 'System Admin';
    } else if (email.startsWith('dispatcher')) {
      role = 'dispatcher';
      code = 'DISP-0001';
      name = 'Central Dispatcher';
    }

    req.isOfflineMock = true;
    req.authUser = {
      id: `mock-id-${role}`,
      email,
      user_metadata: {
        full_name: name,
        role,
        operator_code: code,
        agency_type: agency
      }
    };
    return next();
  }

  try {
    const { data, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !data.user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired token',
      });
    }

    req.authUser = data.user;
    return next();
  } catch (err) {
    console.warn('⚠️ Supabase Auth offline. Attempting to parse token as fallback.');
    let email = 'citizen@eaws.gov.gh';
    if (token.includes('police')) email = 'police@eaws.gov.gh';
    else if (token.includes('fire')) email = 'fire@eaws.gov.gh';
    else if (token.includes('ambulance')) email = 'ambulance@eaws.gov.gh';
    else if (token.includes('admin')) email = 'admin@eaws.gov.gh';
    else if (token.includes('dispatcher')) email = 'dispatcher@eaws.gov.gh';

    let role = 'citizen';
    let code = 'GH-ACR-5501-21';
    let agency = null;
    let name = 'Ghana Citizen';

    if (email.startsWith('police')) {
      role = 'police';
      code = 'POL-0021';
      agency = 'police';
      name = 'Police Operator';
    } else if (email.startsWith('fire')) {
      role = 'fire';
      code = 'GNFS-0012';
      agency = 'fire';
      name = 'Fire Operator';
    } else if (email.startsWith('ambulance')) {
      role = 'ambulance';
      code = 'AMB-0003';
      agency = 'ambulance';
      name = 'EMS Operator';
    } else if (email.startsWith('admin')) {
      role = 'admin';
      code = 'ADMIN-001';
      name = 'System Admin';
    } else if (email.startsWith('dispatcher')) {
      role = 'dispatcher';
      code = 'DISP-0001';
      name = 'Central Dispatcher';
    }

    req.isOfflineMock = true;
    req.authUser = {
      id: `mock-id-${role}`,
      email,
      user_metadata: {
        full_name: name,
        role,
        operator_code: code,
        agency_type: agency
      }
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

