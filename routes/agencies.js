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
    const { data, error } = await supabaseAdmin
      .from('agency_units')
      .select('*, agencies(name)')
      .neq('status', 'OUT_OF_SERVICE');

    if (error) throw error;

    return res.json({ success: true, units: data || [] });
  } catch (error) {
    return next(error);
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

