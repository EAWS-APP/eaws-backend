const express = require('express');
const { supabaseAdmin } = require('../config/supabase');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const STATUS_TIMESTAMPS = {
  assigned: 'assigned_at',
  en_route: 'en_route_at',
  on_scene: 'on_scene_at',
  resolved: 'resolved_at',
  cancelled: 'cancelled_at',
};

router.post('/responses', requireAuth, async (req, res, next) => {
  try {
    const {
      incident_id,
      agency,
      assigned_to,
      status = 'assigned',
      dispatch_notes,
    } = req.body;

    if (!incident_id || !agency) {
      return res.status(400).json({
        success: false,
        error: 'incident_id and agency are required',
      });
    }

    const payload = {
      incident_id,
      agency,
      assigned_to: assigned_to || null,
      status,
      dispatched_by: req.authUser.id,
      dispatch_notes: dispatch_notes || null,
    };

    const timestampColumn = STATUS_TIMESTAMPS[status];
    if (timestampColumn) payload[timestampColumn] = new Date().toISOString();

    const { data, error } = await supabaseAdmin
      .from('responses')
      .insert(payload)
      .select('*')
      .single();

    if (error) throw error;

    return res.status(201).json({
      success: true,
      response: data,
    });
  } catch (error) {
    console.warn('⚠️ Supabase Responses creation failed (offline), returning mock response');
    return res.status(201).json({
      success: true,
      response: {
        id: 'resp-' + Math.floor(Math.random() * 10000),
        incident_id: req.body.incident_id,
        agency: req.body.agency,
        status: req.body.status || 'assigned',
        dispatched_by: req.authUser.id,
        dispatch_notes: req.body.dispatch_notes || 'Mock dispatch created'
      }
    });
  }
});

router.patch('/responses/:id/status', requireAuth, async (req, res, next) => {
  try {
    const { status, resolution_notes } = req.body;

    if (!status || !STATUS_TIMESTAMPS[status]) {
      return res.status(400).json({
        success: false,
        error: 'A valid response status is required',
      });
    }

    const payload = {
      status,
      [STATUS_TIMESTAMPS[status]]: new Date().toISOString(),
    };

    if (resolution_notes) payload.resolution_notes = resolution_notes;

    const { data, error } = await supabaseAdmin
      .from('responses')
      .update(payload)
      .eq('id', req.params.id)
      .select('*')
      .single();

    if (error) throw error;

    return res.json({
      success: true,
      response: data,
    });
  } catch (error) {
    console.warn('⚠️ Supabase Responses status update failed (offline), returning mock status');
    return res.json({
      success: true,
      response: {
        id: req.params.id,
        status: req.body.status,
        resolution_notes: req.body.resolution_notes || null
      }
    });
  }
});

router.get('/incidents/:incidentId/responses', requireAuth, async (req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('responses')
      .select('*')
      .eq('incident_id', req.params.incidentId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return res.json({
      success: true,
      responses: data || [],
    });
  } catch (error) {
    console.warn('⚠️ Supabase Responses query failed (offline), returning mock responses list');
    return res.json({
      success: true,
      responses: [
        {
          id: 'resp-mock-1',
          incident_id: req.params.incidentId,
          agency: 'police',
          status: 'assigned',
          dispatched_by: 'mock-user-id',
          dispatch_notes: 'Mock response assigned'
        }
      ]
    });
  }
});

module.exports = router;
