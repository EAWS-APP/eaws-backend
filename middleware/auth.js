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

  const { data, error } = await supabaseAdmin.auth.getUser(token);

  if (error || !data.user) {
    return res.status(401).json({
      success: false,
      error: 'Invalid or expired token',
    });
  }

  req.authUser = data.user;
  return next();
}

async function attachProfile(req, res, next) {
  if (!req.authUser) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required before attaching profile',
    });
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
    return next(error);
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

