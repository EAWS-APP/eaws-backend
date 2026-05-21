const express = require('express');
const { supabaseAdmin } = require('../config/supabase');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Add a comment to an incident
router.post('/incidents/:id/comments', requireAuth, async (req, res, next) => {
  try {
    const { content } = req.body;
    if (!content) {
      return res.status(400).json({ success: false, error: 'Comment content is required' });
    }

    const payload = {
      incident_id: req.params.id,
      user_id: req.authUser.id,
      content,
    };

    const { data, error } = await supabaseAdmin
      .from('incident_comments')
      .insert(payload)
      .select('*')
      .single();

    if (error) throw error;

    // Note: We'll rely on database triggers to increment comments_count on incidents table

    return res.status(201).json({ success: true, comment: data });
  } catch (error) {
    return next(error);
  }
});

// React to an incident
router.post('/incidents/:id/reactions', requireAuth, async (req, res, next) => {
  try {
    const { reaction_type } = req.body;
    if (!reaction_type || !['like', 'alarmed', 'concerned'].includes(reaction_type)) {
      return res.status(400).json({ success: false, error: 'Valid reaction_type is required' });
    }

    const payload = {
      incident_id: req.params.id,
      user_id: req.authUser.id,
      reaction_type,
    };

    const { data, error } = await supabaseAdmin
      .from('incident_reactions')
      .upsert(payload, { onConflict: 'incident_id,user_id,reaction_type' })
      .select('*')
      .single();

    if (error) throw error;

    // Note: We'll rely on database triggers to increment likes_count on incidents table

    return res.status(201).json({ success: true, reaction: data });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
