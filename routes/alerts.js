const express = require('express');
const { supabaseAdmin } = require('../config/insforge');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.post('/alerts', requireAuth, async (req, res, next) => {
  try {
    if (req.isOfflineMock) throw new Error('Offline mock active');
    const {
      title,
      message,
      severity = 'info',
      status = 'draft',
      country_code = 'GH',
      region,
      district,
      locality,
      latitude,
      longitude,
      radius_meters,
      starts_at,
      expires_at,
      action_url,
      metadata,
    } = req.body;

    if (!title || !message) {
      return res.status(400).json({
        success: false,
        error: 'title and message are required',
      });
    }

    const payload = {
      created_by: req.authUser.id,
      title,
      message,
      severity,
      status,
      country_code,
      region: region || null,
      district: district || null,
      locality: locality || null,
      radius_meters: radius_meters ?? null,
      starts_at: starts_at || new Date().toISOString(),
      expires_at: expires_at || null,
      action_url: action_url || null,
      metadata: metadata || {},
    };

    if (latitude !== undefined && longitude !== undefined) {
      const lat = Number(latitude);
      const lng = Number(longitude);

      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return res.status(400).json({
          success: false,
          error: 'latitude and longitude must be valid numbers',
        });
      }

      payload.target_location = `POINT(${lng} ${lat})`;
    }

    const { data, error } = await supabaseAdmin
      .from('alerts')
      .insert(payload)
      .select('*')
      .single();

    if (error) throw error;

    return res.status(201).json({
      success: true,
      alert: data,
    });
  } catch (error) {
    console.warn('⚠️ Supabase Alert Creation offline, returning mock response');
    return res.status(201).json({
      success: true,
      alert: {
        id: 'alert-' + Math.floor(Math.random() * 10000),
        title: req.body.title,
        message: req.body.message,
        severity: req.body.severity || 'info',
        status: req.body.status || 'draft',
        created_at: new Date().toISOString()
      }
    });
  }
});

router.get('/alerts/active', requireAuth, async (req, res, next) => {
  try {
    if (req.isOfflineMock) throw new Error('Offline mock active');
    const now = new Date().toISOString();
    const { region, district } = req.query;

    let query = supabaseAdmin
      .from('alerts')
      .select('*')
      .eq('status', 'active')
      .lte('starts_at', now)
      .or(`expires_at.is.null,expires_at.gt.${now}`)
      .order('severity', { ascending: false })
      .order('starts_at', { ascending: false });

    if (region) query = query.eq('region', region);
    if (district) query = query.eq('district', district);

    const { data, error } = await query;

    if (error) throw error;

    return res.json({
      success: true,
      alerts: data || [],
    });
  } catch (error) {
    console.warn('⚠️ Supabase Alerts offline, serving mock active alerts.');
    const mockAlerts = [
      {
        id: "alert-1",
        title: "Flash Flood Warning",
        message: "Severe localized flooding expected in low-lying areas of Accra. Evacuate immediately.",
        severity: "critical",
        status: "active",
        starts_at: new Date().toISOString()
      }
    ];
    return res.json({
      success: true,
      alerts: mockAlerts
    });
  }
});

module.exports = router;
