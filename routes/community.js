const express = require('express');
const { supabaseAdmin } = require('../config/supabase');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Get comments for an incident (with commenter profiles)
router.get('/incidents/:id/comments', requireAuth, async (req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('incident_comments')
      .select('*')
      .eq('incident_id', req.params.id)
      .order('created_at', { ascending: true });
    
    if (error) throw error;
    
    let mergedComments = data || [];
    if (mergedComments.length > 0) {
      const userIds = [...new Set(mergedComments.map(c => c.user_id).filter(Boolean))];
      if (userIds.length > 0) {
        const { data: profiles, error: profilesError } = await supabaseAdmin
          .from('profiles')
          .select('*')
          .in('user_id', userIds);
        
        if (!profilesError && profiles) {
          mergedComments = mergedComments.map(comment => {
            const profile = profiles.find(p => p.user_id === comment.user_id);
            return {
              ...comment,
              user_profile: profile || null
            };
          });
        }
      }
    }
    
    return res.json({ success: true, comments: mergedComments });
  } catch (error) {
    return next(error);
  }
});

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
    const reaction_type = req.body.reaction_type || req.body.type;
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
