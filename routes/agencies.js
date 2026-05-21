const express = require('express');
const { supabaseAdmin } = require('../config/supabase');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Get assignments for a specific agency type
router.get('/agencies/:agencyType/assignments', requireAuth, async (req, res, next) => {
  try {
    const { agencyType } = req.params;
    
    // First, find the agency ID
    const { data: agencyData, error: agencyError } = await supabaseAdmin
      .from('agencies')
      .select('id')
      .ilike('name', agencyType) // Use ilike for case-insensitive match
      .single();
      
    if (agencyError || !agencyData) {
      return res.status(404).json({ success: false, error: 'Agency not found' });
    }

    const { data, error } = await supabaseAdmin
      .from('responses')
      .select('*, incidents(*)')
      .eq('agency_id', agencyData.id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return res.json({ success: true, assignments: data });
  } catch (error) {
    return next(error);
  }
});

// Update response status (acknowledge, dispatched, arrived, contained)
router.patch('/responses/:id/status', requireAuth, async (req, res, next) => {
  try {
    const { status, remarks } = req.body;
    
    if (!status) {
      return res.status(400).json({ success: false, error: 'status is required' });
    }

    const { data, error } = await supabaseAdmin
      .from('responses')
      .update({ status, remarks: remarks || null })
      .eq('id', req.params.id)
      .select('*')
      .single();

    if (error) throw error;

    return res.json({ success: true, response: data });
  } catch (error) {
    return next(error);
  }
});

// Get live units for the dashboard map
router.get('/units/live', requireAuth, async (req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('agency_units')
      .select('*, agencies(name)')
      .neq('status', 'OUT_OF_SERVICE');

    if (error) throw error;

    return res.json({ success: true, units: data });
  } catch (error) {
    return next(error);
  }
});

// Alias specifically for dashboard to acknowledge response
router.post('/responses/:id/acknowledge', requireAuth, async (req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('responses')
      .update({ status: 'acknowledged' })
      .eq('id', req.params.id)
      .select('*')
      .single();

    if (error) throw error;

    return res.json({ success: true, response: data });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
