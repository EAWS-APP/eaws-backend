'use strict';
const express = require('express');
const router  = express.Router();
const { db } = require('../config/ifg');
const { broadcastChange } = require('../config/realtime');
const { requireAuth } = require('../middleware/auth');

// Create SOS case
router.post('/sos', requireAuth, async (req, res) => {
  const { sos_type, latitude, longitude, location_name, description, metadata } = req.body;
  try {
    const row = await db.insert('sos_cases', {
      user_id: req.authUser.id,
      status: 'active',
      sos_type: sos_type || 'general',
      latitude: latitude || null,
      longitude: longitude || null,
      location_name: location_name || null,
      description: description || null,
      metadata: metadata || {},
    });
    // Also create a formal incident
    const incidentRow = await db.insert('incidents', {
      reporter_id: req.authUser.id,
      user_id: req.authUser.id,
      title: `SOS: ${sos_type || 'Emergency'} - ${location_name || 'Unknown Location'}`,
      description: description || 'SOS triggered from mobile app',
      category: sos_type || 'general',
      emergency_type: sos_type || 'general',
      severity: 'CRITICAL',
      status: 'pending',
      latitude: latitude || null,
      longitude: longitude || null,
      location_name: location_name || null,
      metadata: { sos_case_id: row.id, ...(metadata || {}) },
    }).catch(() => null);
    broadcastChange('incidents', 'INSERT', incidentRow).catch(() => {});
    return res.status(201).json({ success: true, sos_case: row, incident: incidentRow });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Get user's SOS cases
router.get('/sos/mine', requireAuth, async (req, res) => {
  try {
    const rows = await db.select('sos_cases', {
      filter: { user_id: req.authUser.id },
      order: 'created_at.desc'
    });
    return res.json({ success: true, sos_cases: rows });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Update SOS status (dispatchers only)
router.patch('/sos/:id', requireAuth, async (req, res) => {
  const { status, assigned_unit } = req.body;
  try {
    const updated = await db.update('sos_cases', { id: req.params.id }, {
      status: status || 'responding',
      assigned_unit: assigned_unit || null,
      updated_at: new Date().toISOString(),
      ...(status === 'resolved' ? { resolved_at: new Date().toISOString() } : {})
    });
    broadcastChange('sos_cases', 'UPDATE', Array.isArray(updated) ? updated[0] : updated).catch(() => {});
    return res.json({ success: true, sos_case: Array.isArray(updated) ? updated[0] : updated });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Get all active SOS cases for dispatcher
router.get('/sos/active', requireAuth, async (req, res) => {
  const isDispatcher = ['dispatcher', 'admin', 'police', 'fire', 'ambulance'].includes(
    req.authUser.user_metadata?.role
  );
  if (!isDispatcher) return res.status(403).json({ success: false, error: 'Unauthorized' });
  try {
    const rows = await db.select('sos_cases', {
      filter: { status: 'active' },
      order: 'created_at.desc'
    });
    return res.json({ success: true, sos_cases: rows });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
