const express = require('express');
const { supabaseAdmin } = require('../config/supabase');
const { requireAuth } = require('../middleware/auth');
const { mockComments, mockReactions } = require('./mockDb');

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
    console.warn('⚠️ Supabase Incident Comment failed (offline), returning mock comment');
    const newComment = {
      id: 'comment-' + Math.floor(Math.random() * 10000),
      incident_id: req.params.id,
      user_id: req.authUser.id,
      content: req.body.content,
      created_at: new Date().toISOString(),
      user_profile: {
        full_name: req.authUser.user_metadata?.full_name || 'Ghana Citizen',
        user_role: req.authUser.user_metadata?.role || 'citizen',
        operator_code: req.authUser.user_metadata?.operator_code || null
      }
    };
    if (!mockComments[req.params.id]) {
      mockComments[req.params.id] = [];
    }
    mockComments[req.params.id].push(newComment);
    
    // Also increment comments_count on mock incident
    const { mockIncidents } = require('./mockDb');
    const inc = mockIncidents.find(i => i.id === req.params.id);
    if (inc) {
      inc.comments_count = (inc.comments_count || 0) + 1;
    }

    return res.status(201).json({
      success: true,
      comment: newComment
    });
  }
});

// Get comments for an incident
router.get('/incidents/:id/comments', requireAuth, async (req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('incident_comments')
      .select('*, user_profile:profiles(*)')
      .eq('incident_id', req.params.id)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return res.json({ success: true, comments: data || [] });
  } catch (error) {
    console.warn('⚠️ Supabase Incident Comments GET failed (offline), returning mock comments');
    return res.json({ success: true, comments: mockComments[req.params.id] || [] });
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
    console.warn('⚠️ Supabase Incident Reaction failed (offline), returning mock reaction');
    const newReaction = {
      id: 'reaction-' + Math.floor(Math.random() * 10000),
      incident_id: req.params.id,
      user_id: req.authUser.id,
      reaction_type: req.body.reaction_type,
      created_at: new Date().toISOString()
    };
    
    // Increment likes_count on mock incident
    const { mockIncidents } = require('./mockDb');
    const inc = mockIncidents.find(i => i.id === req.params.id);
    if (inc) {
      inc.likes_count = (inc.likes_count || 0) + 1;
    }

    return res.status(201).json({
      success: true,
      reaction: newReaction
    });
  }
});

module.exports = router;
