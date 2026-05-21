const express = require('express');
const { supabaseAdmin } = require('../config/supabase');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const INCIDENT_SELECT = `
  *,
  incident_media (*),
  responses (*)
`;

function isValidCoordinate(latitude, longitude) {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

router.post('/incidents/sos', requireAuth, async (req, res, next) => {
  try {
    const {
      emergency_type,
      description,
      latitude,
      longitude,
      address,
      metadata,
    } = req.body;

    const lat = Number(latitude);
    const lng = Number(longitude);

    if (!emergency_type || !isValidCoordinate(lat, lng)) {
      return res.status(400).json({
        success: false,
        error: 'emergency_type, valid latitude, and valid longitude are required',
      });
    }

    const { data: duplicates, error: duplicateError } = await supabaseAdmin.rpc(
      'detect_duplicate_incidents',
      {
        new_lat: lat,
        new_lng: lng,
        incident_type: emergency_type,
      }
    );

    if (duplicateError) throw duplicateError;

    const payload = {
      emergency_type,
      description: description || null,
      latitude: lat,
      longitude: lng,
      address: address || null,
      metadata: metadata || {},
      status: 'pending',
      reporter_id: req.authUser.id,
    };

    const { data, error } = await supabaseAdmin
      .from('incidents')
      .insert(payload)
      .select(INCIDENT_SELECT)
      .single();

    if (error) throw error;

    return res.status(201).json({
      success: true,
      incident: data,
      possible_duplicates: duplicates || [],
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/incidents/nearby', requireAuth, async (req, res, next) => {
  try {
    const lat = Number(req.query.latitude);
    const lng = Number(req.query.longitude);
    const radiusMeters = Number(req.query.radius_meters || 1000);
    const emergencyType = req.query.emergency_type || null;

    if (!isValidCoordinate(lat, lng) || !Number.isFinite(radiusMeters) || radiusMeters <= 0) {
      return res.status(400).json({
        success: false,
        error: 'valid latitude, longitude, and radius_meters are required',
      });
    }

    const { data, error } = await supabaseAdmin.rpc('get_nearby_incidents', {
      user_lat: lat,
      user_lng: lng,
      radius_meters: radiusMeters,
      filter_emergency_type: emergencyType,
    });

    if (error) throw error;

    return res.json({
      success: true,
      incidents: data || [],
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/incidents/:id', requireAuth, async (req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('incidents')
      .select(INCIDENT_SELECT)
      .eq('id', req.params.id)
      .single();

    if (error) throw error;

    return res.json({
      success: true,
      incident: data,
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/incidents/:id/media', requireAuth, async (req, res, next) => {
  try {
    const {
      media_type,
      storage_bucket,
      storage_path,
      file_url,
      mime_type,
      file_size_bytes,
      duration_seconds,
      description,
    } = req.body;

    if (!media_type || !storage_path) {
      return res.status(400).json({
        success: false,
        error: 'media_type and storage_path are required',
      });
    }

    const payload = {
      incident_id: req.params.id,
      uploaded_by: req.authUser.id,
      media_type,
      storage_bucket: storage_bucket || null,
      storage_path,
      file_url: file_url || null,
      mime_type: mime_type || null,
      file_size_bytes: file_size_bytes ?? null,
      duration_seconds: duration_seconds ?? null,
      description: description || null,
    };

    const { data, error } = await supabaseAdmin
      .from('incident_media')
      .insert(payload)
      .select('*')
      .single();

    if (error) throw error;

    return res.status(201).json({
      success: true,
      media: data,
    });
  } catch (error) {
    return next(error);
  }
});

// Get incident feed (with filters)
router.get('/incidents/feed', requireAuth, async (req, res, next) => {
  try {
    const { category, severity, distanceKm, timeRange, sort } = req.query;
    
    let query = supabaseAdmin
      .from('incidents')
      .select('*, incident_media(*)')
      .eq('is_verified', true);

    if (category) {
      query = query.eq('category', category);
    }
    
    if (severity) {
      query = query.eq('severity', severity);
    }
    
    if (sort === 'popular') {
      query = query.order('likes_count', { ascending: false });
    } else {
      query = query.order('created_at', { ascending: false });
    }

    const { data, error } = await query;

    if (error) throw error;

    return res.json({ success: true, incidents: data });
  } catch (error) {
    return next(error);
  }
});

// Get user's own reports
router.get('/incidents/my-reports', requireAuth, async (req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('incidents')
      .select('*, incident_media(*)')
      .eq('reporter_id', req.authUser.id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return res.json({ success: true, incidents: data });
  } catch (error) {
    return next(error);
  }
});

// Update an incident (triage, status)
router.patch('/incidents/:id', requireAuth, async (req, res, next) => {
  try {
    const updates = req.body;
    
    // Prevent updating critical fields
    delete updates.id;
    delete updates.reporter_id;
    delete updates.created_at;

    const { data, error } = await supabaseAdmin
      .from('incidents')
      .update(updates)
      .eq('id', req.params.id)
      .select('*')
      .single();

    if (error) throw error;

    return res.json({ success: true, incident: data });
  } catch (error) {
    return next(error);
  }
});

// Get live incidents (all active/verified incidents)
router.get('/incidents/live', requireAuth, async (req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('incidents')
      .select('*, incident_media(*)')
      .eq('is_verified', true)
      .neq('status', 'resolved')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return res.json({ success: true, incidents: data });
  } catch (error) {
    return next(error);
  }
});

// General incident creation endpoint
router.post('/incidents', requireAuth, async (req, res, next) => {
  try {
    const payload = {
      ...req.body,
      reporter_id: req.authUser.id,
      status: 'pending',
    };
    const { data, error } = await supabaseAdmin
      .from('incidents')
      .insert(payload)
      .select('*')
      .single();
    if (error) throw error;
    return res.status(201).json({ success: true, incident: data });
  } catch (error) {
    return next(error);
  }
});

// Triage an incident
router.patch('/incidents/:id/triage', requireAuth, async (req, res, next) => {
  try {
    const { severity, status, notes } = req.body;
    const { data, error } = await supabaseAdmin
      .from('incidents')
      .update({ severity, status, is_verified: true })
      .eq('id', req.params.id)
      .select('*')
      .single();
    if (error) throw error;
    return res.json({ success: true, incident: data });
  } catch (error) {
    return next(error);
  }
});

// Dispatch an agency to an incident
router.post('/incidents/:id/dispatch', requireAuth, async (req, res, next) => {
  try {
    const { agency_type, unit_id, notes } = req.body;
    
    // Find agency ID
    const { data: agencyData } = await supabaseAdmin
      .from('agencies')
      .select('id')
      .ilike('name', agency_type)
      .single();

    const payload = {
      incident_id: req.params.id,
      agency_id: agencyData ? agencyData.id : null,
      unit_id: unit_id || null,
      status: 'dispatched',
      remarks: notes || null,
    };

    const { data, error } = await supabaseAdmin
      .from('responses')
      .insert(payload)
      .select('*')
      .single();
      
    if (error) throw error;
    
    // Also update incident status
    await supabaseAdmin.from('incidents').update({ status: 'assigned' }).eq('id', req.params.id);

    return res.status(201).json({ success: true, response: data });
  } catch (error) {
    return next(error);
  }
});

// Delete an incident
router.delete('/incidents/:id', requireAuth, async (req, res, next) => {
  try {
    const { error } = await supabaseAdmin
      .from('incidents')
      .delete()
      .eq('id', req.params.id)
      .eq('reporter_id', req.authUser.id); // ensure only owner can delete
    if (error) throw error;
    return res.json({ success: true, message: 'Incident deleted' });
  } catch (error) {
    return next(error);
  }
});

// Cancel SOS
router.post('/incidents/sos/:id/cancel', requireAuth, async (req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('incidents')
      .update({ status: 'cancelled' })
      .eq('id', req.params.id)
      .eq('reporter_id', req.authUser.id)
      .select('*')
      .single();
    if (error) throw error;
    return res.json({ success: true, incident: data });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
