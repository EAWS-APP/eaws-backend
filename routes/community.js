'use strict';
const express = require('express');
const router  = express.Router();
const { db } = require('../config/ifg');
const { broadcastChange } = require('../config/realtime');
const { requireAuth } = require('../middleware/auth');

function authorName(user) {
  return (
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    user.email?.split('@')[0] ||
    'Anonymous'
  );
}
function authorInitials(name) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

// ── Comments on incidents ──────────────────────────────────────────────────────

router.post('/incidents/:id/comments', requireAuth, async (req, res) => {
  const { content } = req.body;
  if (!content?.trim()) return res.status(400).json({ success: false, error: 'Comment content required' });
  try {
    const name = authorName(req.authUser);
    const row = await db.insert('incident_comments', {
      incident_id: req.params.id,
      user_id: req.authUser.id,
      content: content.trim(),
      user_name: name,
      user_role: req.authUser.user_metadata?.role || 'citizen',
    });
    // bump comments_count
    await db.update('incidents', { id: req.params.id }, {
      updated_at: new Date().toISOString()
    }).catch(() => {});
    broadcastChange('incidents', 'UPDATE', { id: req.params.id }).catch(() => {});
    return res.status(201).json({ success: true, comment: row });
  } catch (err) {
    console.error('[community] comment insert error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/incidents/:id/comments', requireAuth, async (req, res) => {
  try {
    const rows = await db.select('incident_comments', {
      filter: { incident_id: req.params.id },
      order: 'created_at.asc'
    });
    return res.json({ success: true, comments: rows });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── Reactions on incidents ─────────────────────────────────────────────────────

router.post('/incidents/:id/reactions', requireAuth, async (req, res) => {
  const reaction_type = req.body.reaction_type || req.body.type;
  if (!reaction_type || !['like', 'alarmed', 'concerned'].includes(reaction_type)) {
    return res.status(400).json({ success: false, error: 'Valid reaction_type required' });
  }
  try {
    const row = await db.insert('incident_reactions', {
      incident_id: req.params.id,
      user_id: req.authUser.id,
      reaction_type,
    });
    // bump likes_count
    await db.update('incidents', { id: req.params.id }, {
      updated_at: new Date().toISOString()
    }).catch(() => {});
    broadcastChange('incidents', 'UPDATE', { id: req.params.id }).catch(() => {});
    return res.status(201).json({ success: true, reaction: row });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── Community Posts ────────────────────────────────────────────────────────────

router.get('/posts', requireAuth, async (req, res) => {
  try {
    const posts = await db.select('community_posts', { order: 'created_at.desc' });
    // Attach replies
    const replies = await db.select('community_post_replies', {});
    const replyMap = {};
    for (const r of replies) {
      (replyMap[r.post_id] = replyMap[r.post_id] || []).push(r);
    }
    const enriched = posts.map(p => ({ ...p, replies: replyMap[p.id] || [] }));
    return res.json({ success: true, posts: enriched });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/posts', requireAuth, async (req, res) => {
  const { content, image_url } = req.body;
  if (!content?.trim()) return res.status(400).json({ success: false, error: 'Post content required' });
  try {
    const name = authorName(req.authUser);
    const row = await db.insert('community_posts', {
      author_id: req.authUser.id,
      author_name: name,
      author_initials: authorInitials(name),
      post_type: 'community',
      content: content.trim(),
      image_url: image_url || null,
      is_verified: true,
    });
    broadcastChange('community_posts', 'INSERT', row).catch(() => {});
    return res.status(201).json({ success: true, post: { ...row, replies: [] } });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/posts/:id/replies', requireAuth, async (req, res) => {
  const { content } = req.body;
  if (!content?.trim()) return res.status(400).json({ success: false, error: 'Reply content required' });
  try {
    const name = authorName(req.authUser);
    const row = await db.insert('community_post_replies', {
      post_id: req.params.id,
      author_id: req.authUser.id,
      author_name: name,
      author_initials: authorInitials(name),
      content: content.trim(),
    });
    // bump replies_count
    await db.update('community_posts', { id: req.params.id }, {
      updated_at: new Date().toISOString()
    }).catch(() => {});
    return res.status(201).json({ success: true, reply: row });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
