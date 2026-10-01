'use strict';
const express = require('express');
const router  = express.Router();
const { db } = require('../config/ifg');
const { requireAuth } = require('../middleware/auth');

// GET messages for a citizen thread
router.get('/messages/:citizenId', requireAuth, async (req, res) => {
  const { citizenId } = req.params;
  const isDispatcher = ['dispatcher', 'admin', 'super_admin'].includes(
    req.authUser.user_metadata?.role
  );
  if (!isDispatcher && req.authUser.id !== citizenId) {
    return res.status(403).json({ success: false, error: 'Unauthorized' });
  }
  try {
    const rows = await db.select('messages', {
      filter: { citizen_id: citizenId },
      order: 'created_at.asc'
    });
    // Mark citizen messages as read by dispatcher
    if (isDispatcher) {
      await db.update('messages', { citizen_id: citizenId, is_from_dispatcher: false, is_read: false }, { is_read: true }).catch(() => {});
    }
    return res.json({ success: true, messages: rows, thread_owner: null });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST a new message
router.post('/messages/:citizenId', requireAuth, async (req, res) => {
  const { citizenId } = req.params;
  const { text, type, media_url } = req.body;
  if ((!text?.trim()) && !media_url) {
    return res.status(400).json({ success: false, error: 'Message content or media required' });
  }
  const isDispatcher = ['dispatcher', 'admin'].includes(req.authUser.user_metadata?.role);
  if (!isDispatcher && req.authUser.id !== citizenId) {
    return res.status(403).json({ success: false, error: 'Unauthorized' });
  }
  try {
    const senderName = req.authUser.user_metadata?.full_name || req.authUser.email?.split('@')[0] || 'User';
    const row = await db.insert('messages', {
      citizen_id: citizenId,
      sender_role: isDispatcher ? 'operator' : 'citizen',
      sender_name: senderName,
      content: (text || '').trim(),
      is_from_dispatcher: isDispatcher,
      is_read: false,
      metadata: {
        type: type || 'text',
        media_url: media_url || null,
        sender_id: req.authUser.id,
        operator_badge: req.authUser.user_metadata?.badge_id || null,
        agency: req.authUser.user_metadata?.agency_type || null,
      }
    });
    return res.status(201).json({ success: true, message: row });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE a message (soft delete via metadata flag)
router.delete('/messages/:citizenId/:messageId', requireAuth, async (req, res) => {
  const { citizenId, messageId } = req.params;
  const isDispatcher = ['dispatcher', 'admin'].includes(req.authUser.user_metadata?.role);
  if (!isDispatcher && req.authUser.id !== citizenId) {
    return res.status(403).json({ success: false, error: 'Unauthorized' });
  }
  try {
    const rows = await db.select('messages', { filter: { id: messageId } });
    if (!rows.length) return res.status(404).json({ success: false, error: 'Message not found' });
    const msg = rows[0];
    const updatedMeta = { ...msg.metadata, is_deleted: true, deleted_by: isDispatcher ? 'operator' : 'citizen' };
    const updated = await db.update('messages', { id: messageId }, {
      content: 'This message was deleted',
      metadata: updatedMeta
    });
    return res.json({ success: true, message: Array.isArray(updated) ? updated[0] : updated });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// GET thread summary for dispatchers
router.get('/messages/threads/summary', requireAuth, async (req, res) => {
  const isDispatcher = ['dispatcher', 'admin', 'super_admin'].includes(req.authUser.user_metadata?.role);
  if (!isDispatcher) return res.status(403).json({ success: false, error: 'Unauthorized' });
  try {
    // Aggregate by citizen_id - get all messages then group
    const all = await db.select('messages', { order: 'created_at.desc' });
    const threadMap = {};
    for (const m of all) {
      if (!threadMap[m.citizen_id]) {
        threadMap[m.citizen_id] = {
          citizen_id: m.citizen_id,
          total_messages: 0,
          unread_count: 0,
          last_message: null,
          last_active: null,
          thread_owner: null
        };
      }
      const t = threadMap[m.citizen_id];
      t.total_messages++;
      if (!m.is_read && m.sender_role === 'citizen') t.unread_count++;
      if (!t.last_message) {
        t.last_message = m;
        t.last_active = m.created_at;
      }
    }
    const threads = Object.values(threadMap).sort((a, b) =>
      new Date(b.last_active || 0) - new Date(a.last_active || 0)
    );
    return res.json({ success: true, threads });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// GET operator audit log — all dispatcher messages
router.get('/messages/audit/logs', requireAuth, async (req, res) => {
  const isDispatcher = ['dispatcher', 'admin', 'super_admin'].includes(req.authUser.user_metadata?.role);
  if (!isDispatcher) return res.status(403).json({ success: false, error: 'Unauthorized' });
  try {
    const logs = await db.select('messages', {
      filter: { is_from_dispatcher: true },
      order: 'created_at.desc'
    });
    return res.json({ success: true, logs, thread_owners: {} });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// CLAIM a thread (dispatcher takes ownership - stored in profile metadata)
router.post('/messages/:citizenId/claim', requireAuth, async (req, res) => {
  const isDispatcher = ['dispatcher', 'admin'].includes(req.authUser.user_metadata?.role);
  if (!isDispatcher) return res.status(403).json({ success: false, error: 'Only operators can claim threads' });
  const owner = {
    operator_id: req.authUser.id,
    operator_name: req.authUser.user_metadata?.full_name || req.authUser.email?.split('@')[0] || 'Dispatcher',
    operator_badge: req.authUser.user_metadata?.badge_id || 'DISPATCH-01',
    agency: req.authUser.user_metadata?.agency_type || 'Central Command',
    claimed_at: new Date().toISOString()
  };
  // Post a system message announcing the claim
  await db.insert('messages', {
    citizen_id: req.params.citizenId,
    sender_role: 'system',
    sender_name: 'System',
    content: `${owner.operator_name} has joined this conversation.`,
    is_from_dispatcher: true,
    is_read: false,
    metadata: { type: 'system', claim: owner }
  }).catch(() => {});
  return res.json({ success: true, thread_owner: owner });
});

module.exports = router;
