const express = require('express');
const { supabaseAdmin } = require('../config/supabase');
const { requireAuth, requireRole, requireAnyRole } = require('../middleware/auth');

const router = express.Router();

// Get assignments for a specific agency type
router.get('/agencies/:agencyType/assignments', requireAnyRole(['police', 'ambulance', 'fire', 'nadmo', 'dispatcher']), async (req, res, next) => {
  try {
    const { agencyType } = req.params;

    const { data, error } = await supabaseAdmin
      .from('incident_assignments')
      .select('*, incidents(*)')
      .eq('agency_type', agencyType.toLowerCase())
      .order('assigned_at', { ascending: false });

    if (error) throw error;

    // Map to the contract that the Next.js and mobile apps expect:
    const assignments = (data || []).map((a) => ({
      id: a.id,
      incident_id: a.incident_id,
      incident_title: a.incidents ? (a.incidents.title || a.incidents.emergency_type) : 'Emergency Call',
      location_name: a.incidents ? (a.incidents.location_name || a.incidents.address) : 'Unknown Location',
      priority: a.priority || 'medium',
      status: a.status,
      created_at: a.assigned_at,
      eta_minutes: a.eta_minutes || null,
      notes: a.notes || null,
      incident_description: a.incidents ? a.incidents.description : '',
      incident_metadata: a.incidents ? (a.incidents.metadata || {}) : {},
      latitude: a.incidents ? a.incidents.latitude : null,
      longitude: a.incidents ? a.incidents.longitude : null,
    }));

    return res.json({ success: true, assignments });
  } catch (error) {
    return next(error);
  }
});

// Helper for status timestamp mappings
function getStatusTimestampField(status) {
  switch (status) {
    case 'acknowledged': return 'acknowledged_at';
    case 'en_route': return 'en_route_at';
    case 'on_scene': return 'arrived_at';
    case 'resolved': return 'resolved_at';
    default: return null;
  }
}

// Helper to process status updates on assignments
async function processAssignmentStatusUpdate(assignmentId, status, remarks, actorId, req, res) {
  // Fetch existing assignment to know previous status and incident_id
  const { data: assignment, error: fetchError } = await supabaseAdmin
    .from('incident_assignments')
    .select('*')
    .eq('id', assignmentId)
    .single();

  if (fetchError || !assignment) {
    return res.status(404).json({ success: false, error: 'Assignment not found' });
  }

  const updates = {
    status,
    updated_at: new Date().toISOString(),
  };

  const tsField = getStatusTimestampField(status);
  if (tsField) {
    updates[tsField] = new Date().toISOString();
  }

  const { data, error } = await supabaseAdmin
    .from('incident_assignments')
    .update(updates)
    .eq('id', assignmentId)
    .select('*')
    .single();

  if (error) throw error;

  // Insert Response Status Event for history tracking
  await supabaseAdmin.from('response_status_events').insert({
    assignment_id: assignmentId,
    incident_id: assignment.incident_id,
    actor_id: actorId,
    from_status: assignment.status,
    to_status: status,
    notes: remarks || null,
  });

  // Create Audit Log
  await supabaseAdmin.from('audit_logs').insert({
    actor_id: actorId,
    action: 'update_assignment_status',
    entity_type: 'incident_assignments',
    entity_id: assignmentId,
    metadata: { from_status: assignment.status, to_status: status, remarks },
  });

  // Cascade resolved state to parent incident
  if (status === 'resolved') {
    await supabaseAdmin
      .from('incidents')
      .update({ status: 'resolved', resolved_at: new Date().toISOString() })
      .eq('id', assignment.incident_id);
  } else if (status === 'en_route' || status === 'on_scene') {
    await supabaseAdmin
      .from('incidents')
      .update({ status: 'in_progress' })
      .eq('id', assignment.incident_id);
  }

  return res.json({ success: true, response: data });
}

// Update response/assignment status
// (Supports both responses/:id/status and assignments/:id/status paths for compatibility)
const handleStatusUpdate = async (req, res, next) => {
  try {
    const { status, remarks, notes } = req.body;
    const assignmentId = req.params.id;

    if (!status) {
      return res.status(400).json({ success: false, error: 'status is required' });
    }

    return await processAssignmentStatusUpdate(
      assignmentId,
      status,
      remarks || notes,
      req.authUser.id,
      req,
      res
    );
  } catch (error) {
    return next(error);
  }
};

router.patch('/responses/:id/status', requireAnyRole(['police', 'ambulance', 'fire', 'nadmo', 'dispatcher']), handleStatusUpdate);
router.patch('/assignments/:id/status', requireAnyRole(['police', 'ambulance', 'fire', 'nadmo', 'dispatcher']), handleStatusUpdate);

// Get live units for the dashboard map
router.get('/units/live', requireAuth, async (req, res, next) => {
  try {
    if (req.isOfflineMock) throw new Error('Offline mock active');
    const { data, error } = await supabaseAdmin
      .from('agency_units')
      .select('id, callsign, status, current_latitude, current_longitude, unit_type, agency_id, agencies(name, agency_type)')
      .neq('status', 'OUT_OF_SERVICE');

    if (error) throw error;

    // Normalize: flatten nested agencies join so the map component can access agency_type and name
    const units = (data || []).map((u) => ({
      id: u.id,
      name: u.callsign || `UNIT-${u.id.slice(0, 6)}`,
      agency_type: u.agencies?.agency_type || u.unit_type || 'police',
      status: u.status?.toLowerCase() || 'available',
      latitude: u.current_latitude || 5.6037,
      longitude: u.current_longitude || -0.1870,
      last_updated: u.last_updated,
    }));

    return res.json({ success: true, units });
  } catch (error) {
    console.warn('⚠️ Supabase Agency Units offline, serving mock units.');
    const mockUnits = [
      { id: 'unit-1', name: 'PATROL-Alpha', agency_type: 'police', status: 'available', latitude: 5.5600, longitude: -0.1900 },
      { id: 'unit-2', name: 'PATROL-Beta', agency_type: 'police', status: 'busy', latitude: 5.6200, longitude: -0.1700 },
      { id: 'unit-3', name: 'FIRE-Engine-1', agency_type: 'fire', status: 'available', latitude: 5.5458, longitude: -0.2078 },
      { id: 'unit-4', name: 'EMS-Amb-3', agency_type: 'ambulance', status: 'available', latitude: 5.6100, longitude: -0.1800 },
      { id: 'unit-5', name: 'EMS-Amb-5', agency_type: 'ambulance', status: 'busy', latitude: 5.6178, longitude: -0.1872 },
    ];
    return res.json({ success: true, units: mockUnits });
  }
});

// Acknowledge assignment
const handleAcknowledge = async (req, res, next) => {
  try {
    const assignmentId = req.params.id;
    return await processAssignmentStatusUpdate(
      assignmentId,
      'acknowledged',
      'Acknowledged dispatch assignment.',
      req.authUser.id,
      req,
      res
    );
  } catch (error) {
    return next(error);
  }
};

router.post('/responses/:id/acknowledge', requireAnyRole(['police', 'ambulance', 'fire', 'nadmo']), handleAcknowledge);
router.post('/assignments/:id/acknowledge', requireAnyRole(['police', 'ambulance', 'fire', 'nadmo']), handleAcknowledge);

module.exports = router;

