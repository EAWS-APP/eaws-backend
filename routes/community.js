const express = require('express');
const { supabaseAdmin } = require('../config/supabase');
const { requireAuth } = require('../middleware/auth');
const { mockComments, mockReactions, mockCommunityPosts, saveCommunityPosts, saveComments, resolveAuthorName } = require('./mockDb');

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
    console.warn('⚠️ Supabase Incident Comment failed (offline), returning mock comment');
    const newComment = {
      id: 'comment-' + Math.floor(Math.random() * 10000),
      incident_id: req.params.id,
      user_id: req.authUser.id,
      content: req.body.content,
      created_at: new Date().toISOString(),
      user_profile: {
        full_name: req.authUser.user_metadata?.full_name || resolveAuthorName(req.authUser) || 'Citizen Reporter',
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

// Get comments for an incident (with offline mock fallback)
router.get('/incidents/:id/comments', requireAuth, async (req, res, next) => {
  // Fast-path: mock/offline mode
  if (req.isOfflineMock) {
    return res.json({ success: true, comments: mockComments[req.params.id] || [] });
  }
  try {
    const { data, error } = await supabaseAdmin
      .from('incident_comments')
      .select('*, user_profile:profiles(*)')
      .eq('incident_id', req.params.id)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return res.json({ success: true, comments: data || [] });
  } catch (error) {
    console.warn('\u26a0\ufe0f Supabase Incident Comments GET failed (offline), returning mock comments');
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
    
    const { mockIncidents, mockCommunityPosts, saveIncidents, saveCommunityPosts } = require('./mockDb');
    const inc = mockIncidents.find(i => i.id === req.params.id);
    if (inc) {
      if (req.body.reaction_type === 'alarmed') inc.alarmed_count = (inc.alarmed_count || 0) + 1;
      else if (req.body.reaction_type === 'concerned') inc.concerned_count = (inc.concerned_count || 0) + 1;
      else inc.likes_count = (inc.likes_count || 0) + 1;
      if (typeof saveIncidents === 'function') saveIncidents();
    }
    const cp = mockCommunityPosts.find(p => p.id === req.params.id);
    if (cp) {
      cp.likes_count = (cp.likes_count || 0) + 1;
      if (typeof saveCommunityPosts === 'function') saveCommunityPosts();
    }

    return res.status(201).json({
      success: true,
      reaction: newReaction
    });
  }
});

// ─── Community Posts (free-form messages, not formal incidents) ───────────────

// GET all community posts, newest-first
router.get('/posts', requireAuth, async (req, res) => {
  try {
    if (req.isOfflineMock) throw new Error('offline');
    const { data, error } = await supabaseAdmin
      .from('community_posts')
      .select('*, replies:community_post_replies(*)')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return res.json({ success: true, posts: data || [] });
  } catch {
    return res.json({
      success: true,
      posts: [...mockCommunityPosts].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    });
  }
});

// POST — create a new free-form community message
router.post('/posts', requireAuth, async (req, res) => {
  const { content, image_url } = req.body;
  if (!content || !content.trim()) {
    return res.status(400).json({ success: false, error: 'Post content is required.' });
  }
  try {
    if (req.isOfflineMock) throw new Error('offline');
    const { data, error } = await supabaseAdmin
      .from('community_posts')
      .insert({ content: content.trim(), image_url: image_url || null, author_id: req.authUser.id })
      .select('*').single();
    if (error) throw error;
    return res.status(201).json({ success: true, post: data });
  } catch {
    const name = resolveAuthorName(req.authUser);
    const newPost = {
      id: 'cp-' + Math.floor(Math.random() * 90000 + 10000),
      post_type: 'community',
      content: content.trim(),
      image_url: image_url || null,
      author_id: req.authUser.id,
      author_name: name,
      author_initials: name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2),
      is_verified: true,
      created_at: new Date().toISOString(),
      replies_count: 0,
      likes_count: 0,
      replies: [],
    };
    mockCommunityPosts.unshift(newPost);
    if (typeof saveCommunityPosts === 'function') saveCommunityPosts();
    return res.status(201).json({ success: true, post: newPost });
  }
});

// POST — reply to a community post
router.post('/posts/:id/replies', requireAuth, async (req, res) => {
  const { content } = req.body;
  if (!content || !content.trim()) {
    return res.status(400).json({ success: false, error: 'Reply content is required.' });
  }
  try {
    if (req.isOfflineMock) throw new Error('offline');
    const { data, error } = await supabaseAdmin
      .from('community_post_replies')
      .insert({ post_id: req.params.id, author_id: req.authUser.id, content: content.trim() })
      .select('*').single();
    if (error) throw error;
    return res.status(201).json({ success: true, reply: data });
  } catch {
    const name = resolveAuthorName(req.authUser);
    const reply = {
      id: 'cpr-' + Math.floor(Math.random() * 90000 + 10000),
      post_id: req.params.id,
      author_name: name,
      author_initials: name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2),
      content: content.trim(),
      created_at: new Date().toISOString(),
    };
    const post = mockCommunityPosts.find(p => p.id === req.params.id);
    if (post) {
      post.replies = post.replies || [];
      post.replies.push(reply);
      post.replies_count = post.replies.length;
      if (typeof saveCommunityPosts === 'function') saveCommunityPosts();
    }
    return res.status(201).json({ success: true, reply });
  }
});

module.exports = router;
