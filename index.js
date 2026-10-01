const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const { supabaseAdmin } = require('./config/supabase');
const { requireAuth } = require('./middleware/auth');
const authRoutes = require('./routes/auth');
const incidentRoutes = require('./routes/incidents');
const responseRoutes = require('./routes/responses');
const alertRoutes = require('./routes/alerts');
const communityRoutes = require('./routes/community');
const agencyRoutes = require('./routes/agencies');
const adminRoutes = require('./routes/admin');
const messageRoutes = require('./routes/messages');
const sosRoutes = require('./routes/sos');

const app = express();
// PORT must match NEXT_PUBLIC_API_BASE_URL in the dashboard (.env.local)
// PORT must match NEXT_PUBLIC_API_BASE_URL (dashboard) and EawsApiClient.baseUrl (mobile)
const PORT = process.env.PORT || 5001;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'EAWS Backend is running',
    timestamp: new Date().toISOString(),
  });
});

// ─── Route registration ───────────────────────────────────────────────────────
app.use('/api', authRoutes);
app.use('/api', incidentRoutes);
app.use('/api', responseRoutes);
app.use('/api', alertRoutes);
app.use('/api/community', communityRoutes);
app.use('/api', agencyRoutes);
app.use('/api', adminRoutes);
app.use('/api', messageRoutes);
app.use('/api', sosRoutes);


// ─── /api/me — resolves user profile & role for dashboard routing ─────────────
// NOTE: profiles table uses `user_id` as FK to auth.users (not `id`)
app.get('/api/me', requireAuth, async (req, res, next) => {
  try {
    if (req.isOfflineMock) {
      const meta = req.authUser.user_metadata || {};
      return res.json({
        success: true,
        user: { id: req.authUser.id, email: req.authUser.email },
        profile: {
          user_role: meta.role || 'citizen',
          operator_code: meta.operator_code || null,
          agency_type: meta.agency_type || null,
          is_approved: true,
          is_active: true,
          full_name: meta.full_name || null,
        },
        permissions: [],
      });
    }

    let profile = null;
    let dbError = null;

    try {
      const { data, error } = await supabaseAdmin
        .from('profiles')
        .select('user_role, operator_code, agency_type, is_approved, is_active, full_name')
        .eq('user_id', req.authUser.id)
        .single();
      profile = data;
      dbError = error;
    } catch (err) {
      console.warn('⚠️ Supabase Database offline when loading profile:', err.message);
      dbError = err;
    }

    if (profile) {
      try {
        // Auto-sync user to public.users to satisfy responses(dispatched_by) foreign key constraint
        const role = profile.user_role || req.authUser.user_metadata?.role || 'citizen';
        const fullName = profile.full_name || req.authUser.user_metadata?.full_name || req.authUser.email.split('@')[0];
        const phoneNumber = req.authUser.phone || req.authUser.user_metadata?.phone || '+233551234567';

        await supabaseAdmin
          .from('users')
          .upsert({
            id: req.authUser.id,
            full_name: fullName,
            phone_number: phoneNumber,
            role: role,
          }, { onConflict: 'id' });
      } catch (err) {
        console.warn('⚠️ Supabase users sync failed (offline):', err.message);
      }
    }

    if (dbError || !profile) {
      // Fallback: read role from Supabase Auth user_metadata (set at account creation)
      const meta = req.authUser.user_metadata || {};
      return res.json({
        success: true,
        user: { id: req.authUser.id, email: req.authUser.email },
        profile: {
          user_role: meta.role || 'citizen',
          operator_code: meta.operator_code || null,
          agency_type: meta.agency_type || null,
          is_approved: true,
          is_active: true,
          full_name: meta.full_name || null,
        },
        permissions: [],
      });
    }

    return res.json({
      success: true,
      user: { id: req.authUser.id, email: req.authUser.email },
      profile,
      permissions: [],
    });
  } catch (err) {
    return next(err);
  }
});

// ─── 404 handler ──────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route not found',
  });
});

// ─── Global error handler ─────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Internal Server Error',
  });
});

app.listen(PORT, () => {
  console.log(`EAWS Backend Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = { app, supabase: supabaseAdmin };
