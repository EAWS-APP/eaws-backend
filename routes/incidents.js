const express = require('express');
const { supabaseAdmin } = require('../config/supabase');


const { requireAuth, requireRole, requireAnyRole, attachProfile } = require('../middleware/auth');
const { mockIncidents } = require('./mockDb');

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
      category,
      description,
      latitude,
      longitude,
      address,
      location_name,
      metadata,
    } = req.body;

    const lat = Number(latitude);
    const lng = Number(longitude);

    if (!isValidCoordinate(lat, lng)) {
      return res.status(400).json({
        success: false,
        error: 'Valid latitude and valid longitude are required',
      });
    }

    const resolvedType = category || emergency_type || 'SOS';
    const resolvedLocationName = location_name || address || 'Unknown Location';

    const { data: duplicates, error: duplicateError } = await supabaseAdmin.rpc(
      'detect_duplicate_incidents',
      {
        new_lat: lat,
        new_lng: lng,
        incident_type: resolvedType,
      }
    );

    if (duplicateError) throw duplicateError;

    const payload = {
      emergency_type: resolvedType,
      category: resolvedType,
      title: req.body.title || 'Emergency SOS',
      description: description || 'Citizen triggered emergency SOS broadcast.',
      latitude: lat,
      longitude: lng,
      address: resolvedLocationName,
      location_name: resolvedLocationName,
      metadata: metadata || {},
      status: 'pending',
      reporter_id: req.authUser.id,
      user_id: req.authUser.id,
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
router.get('/incidents/feed', requireAuth, attachProfile, async (req, res, next) => {
  try {
    if (req.isOfflineMock) throw new Error('Offline mock active');
    const { category, severity, distanceKm, timeRange, sort } = req.query;
    
    const role = req.userProfile ? req.userProfile.user_role : 'citizen';
    const isOps = ['dispatcher', 'police', 'ambulance', 'fire', 'nadmo', 'admin', 'super_admin'].includes(role);

    let query = supabaseAdmin
      .from('incidents')
      .select('*, incident_media(*)');

    // Allow citizens and operators to see all posts so the mobile app and web dashboard community feeds are fully synced.

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

    const { data: incidents, error } = await query;

    if (error) throw error;

    // Map media_url and media_type from incident_media relationship
    let mappedIncidents = (incidents || []).map(incident => {
      const firstMedia = incident.incident_media && incident.incident_media.length > 0 ? incident.incident_media[0] : null;
      return {
        ...incident,
        media_url: firstMedia ? firstMedia.file_url : null,
        media_type: firstMedia ? firstMedia.media_type : null
      };
    });

    // Fetch profiles for the reporter_ids of these incidents
    if (mappedIncidents.length > 0) {
      const reporterIds = [...new Set(mappedIncidents.map(i => i.reporter_id).filter(Boolean))];
      if (reporterIds.length > 0) {
        const { data: profiles, error: profilesError } = await supabaseAdmin
          .from('profiles')
          .select('*')
          .in('user_id', reporterIds);
        
        if (!profilesError && profiles) {
          mappedIncidents = mappedIncidents.map(incident => {
            const profile = profiles.find(p => p.user_id === incident.reporter_id);
            return {
              ...incident,
              reporter_profile: profile || null
            };
          });
        }
      }
    }

    return res.json({ success: true, incidents: mappedIncidents });
  } catch (error) {
    console.warn('⚠️ Supabase Incidents Feed offline, serving mock incidents.');
    const { mockProfiles } = require('./mockDb');
    const activeIncidents = mockIncidents.filter(inc => {
      const reporter = mockProfiles[inc.reporter_id];
      return !reporter || reporter.is_active !== false;
    });
    return res.json({ success: true, incidents: activeIncidents });
  }
});

// Get user's own reports
router.get('/incidents/my-reports', requireAuth, async (req, res, next) => {
  try {
    if (req.isOfflineMock) throw new Error('Offline mock active');
    const { data, error } = await supabaseAdmin
      .from('incidents')
      .select('*, incident_media(*)')
      .eq('reporter_id', req.authUser.id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const mapped = (data || []).map(incident => {
      const firstMedia = incident.incident_media && incident.incident_media.length > 0 ? incident.incident_media[0] : null;
      return {
        ...incident,
        media_url: firstMedia ? firstMedia.file_url : null,
        media_type: firstMedia ? firstMedia.media_type : null
      };
    });

    return res.json({ success: true, incidents: mapped });
  } catch (error) {
    console.warn('⚠️ Supabase Incidents My-Reports offline, serving empty mock list.');
    return res.json({ success: true, incidents: [] });
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
    const idx = mockIncidents.findIndex(inc => inc.id === req.params.id);
    let updated = { id: req.params.id, ...req.body };
    if (idx !== -1) {
      mockIncidents[idx] = {
        ...mockIncidents[idx],
        ...req.body
      };
      updated = mockIncidents[idx];
    }
    return res.json({ success: true, incident: updated });
  }
});

// Get live incidents (all active/verified incidents)
router.get('/incidents/live', requireAuth, attachProfile, async (req, res, next) => {
  try {
    const role = req.userProfile ? req.userProfile.user_role : 'citizen';
    const isOps = ['dispatcher', 'police', 'ambulance', 'fire', 'nadmo', 'admin', 'super_admin'].includes(role);

    let query = supabaseAdmin
      .from('incidents')
      .select('*, incident_media(*)')
      .neq('status', 'resolved');

    // Allow citizens and operators to see all active reports for full sync.

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) throw error;

    const mapped = (data || []).map(incident => {
      const firstMedia = incident.incident_media && incident.incident_media.length > 0 ? incident.incident_media[0] : null;
      return {
        ...incident,
        media_url: firstMedia ? firstMedia.file_url : null,
        media_type: firstMedia ? firstMedia.media_type : null
      };
    });

    return res.json({ success: true, incidents: mapped });
  } catch (error) {
    return next(error);
  }
});

// Get single incident by ID
router.get('/incidents/:id', requireAuth, async (req, res, next) => {
  try {
    if (req.isOfflineMock) throw new Error('Offline mock active');
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
    console.warn('⚠️ Supabase Incidents offline, serving mock incidents.');
    const activeMocks = mockIncidents.filter(inc => inc.status !== 'resolved');
    return res.json({ success: true, incidents: activeMocks });
  }
});

// Wildcard route - placed below static GET routes to avoid matching "live", "feed", etc.
router.get('/incidents/:id', requireAuth, async (req, res, next) => {
  try {
    if (req.isOfflineMock) throw new Error('Offline mock active');
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
    const found = mockIncidents.find(inc => inc.id === req.params.id);
    return res.json({
      success: true,
      incident: found || {
        id: req.params.id,
        title: "Simulated Incident " + req.params.id,
        category: "police",
        severity: "HIGH",
        status: "assigned",
        description: "Simulated incident detail view for operators.",
        latitude: 5.6037,
        longitude: -0.1870,
        location_name: "Accra, Ghana",
        is_verified: true,
        created_at: new Date().toISOString(),
        incident_media: []
      }
    });
  }
});

// General incident creation endpoint
router.post('/incidents', requireAuth, attachProfile, async (req, res, next) => {
  try {
    if (req.isOfflineMock) throw new Error('Offline mock active');
    const role = req.userProfile ? req.userProfile.user_role : 'citizen';
    const isOps = ['dispatcher', 'police', 'ambulance', 'fire', 'nadmo', 'admin', 'super_admin'].includes(role);
    const payload = {
      ...req.body,
      reporter_id: req.authUser.id,
      user_id: req.authUser.id,
      status: isOps ? 'active' : 'pending',
      is_verified: isOps ? true : false,
    };
    const { data, error } = await supabaseAdmin
      .from('incidents')
      .insert(payload)
      .select('*')
      .single();
    if (error) throw error;
    return res.status(201).json({ success: true, incident: data });
  } catch (error) {
    const newInc = {
      id: 'inc-' + Math.floor(Math.random() * 10000),
      status: 'pending',
      is_verified: true,
      created_at: new Date().toISOString(),
      likes_count: 0,
      comments_count: 0,
      views_count: 0,
      reporter_id: req.authUser.id,
      user_id: req.authUser.id,
      user_name: req.authUser.user_metadata?.full_name || 'Ghana Citizen',
      reporter_profile: {
        full_name: req.authUser.user_metadata?.full_name || 'Ghana Citizen',
        user_role: req.authUser.user_metadata?.role || 'citizen',
        operator_code: req.authUser.user_metadata?.operator_code || null
      },
      ...req.body,
    };
    mockIncidents.unshift(newInc);
    return res.status(201).json({
      success: true,
      incident: newInc
    });
  }
});

// Triage an incident
router.patch('/incidents/:id/triage', requireRole('dispatcher'), async (req, res, next) => {
  try {
    if (req.isOfflineMock) throw new Error('Offline mock active');
    const { severity, status, notes } = req.body;
    const { data, error } = await supabaseAdmin
      .from('incidents')
      .update({ severity, status, is_verified: true })
      .eq('id', req.params.id)
      .select('*')
      .single();
      
    if (error) throw error;

    // Create Audit Log
    await supabaseAdmin.from('audit_logs').insert({
      actor_id: req.authUser.id,
      action: 'triage_incident',
      entity_type: 'incidents',
      entity_id: req.params.id,
      metadata: { severity, status, notes },
    });

    return res.json({ success: true, incident: data });
  } catch (error) {
    console.warn('⚠️ Supabase triage failed (offline), returning mock success');
    const idx = mockIncidents.findIndex(inc => inc.id === req.params.id);
    let updated = {
      id: req.params.id,
      severity: req.body.severity || 'CRITICAL',
      status: req.body.status || 'assigned',
      is_verified: true,
      updated_at: new Date().toISOString()
    };
    if (idx !== -1) {
      mockIncidents[idx] = {
        ...mockIncidents[idx],
        severity: req.body.severity || mockIncidents[idx].severity,
        status: req.body.status || mockIncidents[idx].status,
        is_verified: true,
        updated_at: new Date().toISOString()
      };
      updated = mockIncidents[idx];
    }
    return res.json({
      success: true,
      incident: updated
    });
  }
});

// Dispatch an agency to an incident
router.post('/incidents/:id/dispatch', requireRole('dispatcher'), async (req, res, next) => {
  try {
    if (req.isOfflineMock) throw new Error('Offline mock active');
    const { agency_type, unit_id, notes, priority = 'medium' } = req.body;
    
    const payload = {
      incident_id: req.params.id,
      agency: agency_type ? agency_type.toLowerCase() : 'police',
      status: 'assigned',
      dispatched_by: req.authUser.id,
      dispatch_notes: notes || null,
    };

    const { data, error } = await supabaseAdmin
      .from('responses')
      .upsert(payload, { onConflict: 'incident_id,agency', ignoreDuplicates: false })
      .select('*')
      .single();
      
    if (error) throw error;
    
    // Also update incident status
    await supabaseAdmin.from('incidents').update({ status: 'assigned' }).eq('id', req.params.id);

    // Create Audit Log
    await supabaseAdmin.from('audit_logs').insert({
      actor_id: req.authUser.id,
      action: 'dispatch_agency',
      entity_type: 'incidents',
      entity_id: req.params.id,
      metadata: { agency_type, unit_id, priority, assignment_id: data.id },
    });

    return res.status(201).json({
      success: true,
      response_id: data.id,
      status: data.status,
      assignment: data,
    });
  } catch (error) {
    console.warn('⚠️ Supabase dispatch failed (offline), returning mock response');
    return res.status(201).json({
      success: true,
      response: {
        id: 'resp-' + Math.floor(Math.random() * 10000),
        incident_id: req.params.id,
        agency: req.body.agency_type || 'police',
        status: 'assigned',
        dispatch_notes: req.body.notes || 'Dispatched unit in mock mode'
      }
    });
  }
});

// Update responder assignment status (e.g. accepted, en_route, arrived, resolved)
router.patch('/incidents/assignments/:assignmentId/status', requireAuth, async (req, res, next) => {
  try {
    const { status } = req.body;
    const validStatuses = ['assigned', 'accepted', 'en_route', 'arrived', 'transporting', 'resolved'];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
      });
    }

    const { data: assignment, error: fetchError } = await supabaseAdmin
      .from('incident_assignments')
      .select('*')
      .eq('id', req.params.assignmentId)
      .single();

    if (fetchError || !assignment) {
      return res.status(404).json({
        success: false,
        error: 'Assignment not found',
      });
    }

    // Update assignment status
    const { data, error } = await supabaseAdmin
      .from('incident_assignments')
      .update({ status })
      .eq('id', req.params.assignmentId)
      .select('*')
      .single();

    if (error) throw error;

    // Update parent incident status
    if (status === 'resolved') {
      await supabaseAdmin
        .from('incidents')
        .update({ status: 'resolved' })
        .eq('id', assignment.incident_id);
    } else {
      await supabaseAdmin
        .from('incidents')
        .update({ status: 'active' })
        .eq('id', assignment.incident_id);
    }

    // Create Audit Log
    await supabaseAdmin.from('audit_logs').insert({
      actor_id: req.authUser.id,
      action: 'update_assignment_status',
      entity_type: 'incident_assignments',
      entity_id: req.params.assignmentId,
      metadata: { status },
    });

    return res.json({ success: true, assignment: data });
  } catch (error) {
    return next(error);
  }
});

// Request tactical backup/escalate incident
router.post('/incidents/:id/escalate', requireAuth, async (req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('incidents')
      .update({
        status: 'escalated',
        severity: 'CRITICAL',
        is_verified: true
      })
      .eq('id', req.params.id)
      .select('*')
      .single();

    if (error) throw error;

    // Create Audit Log
    await supabaseAdmin.from('audit_logs').insert({
      actor_id: req.authUser.id,
      action: 'escalate_incident',
      entity_type: 'incidents',
      entity_id: req.params.id,
      metadata: { reason: req.body.reason || 'Tactical backup requested' },
    });

    return res.json({ success: true, incident: data });
  } catch (error) {
    return next(error);
  }
});


// Delete an incident
router.delete('/incidents/:id', requireAuth, async (req, res, next) => {
  try {
    const role = req.authUser.user_metadata?.role || 'citizen';
    const isOperator = ['dispatcher', 'police', 'fire', 'ambulance', 'admin'].includes(role);

    if (req.isOfflineMock) {
      const idx = mockIncidents.findIndex(p => p.id === req.params.id);
      if (idx === -1) {
        return res.status(404).json({ success: false, error: 'Incident not found' });
      }
      
      const incident = mockIncidents[idx];
      // Ensure only owner or operator can delete
      if (!isOperator && incident.reporter_id !== req.authUser.id) {
        return res.status(403).json({ success: false, error: 'Unauthorized to delete this post' });
      }

      mockIncidents.splice(idx, 1);
      return res.json({ success: true, message: 'Incident deleted' });
    }

    // Supabase mode
    let query = supabaseAdmin.from('incidents').delete().eq('id', req.params.id);
    
    // If not operator, restrict to only their own post
    if (!isOperator) {
      query = query.eq('reporter_id', req.authUser.id);
    }

    const { error } = await query;
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
