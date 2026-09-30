const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { mockMessages, saveMessages, resolveAuthorName } = require('./mockDb');

const router = express.Router();

// In-memory thread owners map (citizenId -> { operator_id, operator_name, operator_badge, agency, claimed_at })
const mockThreadOwners = {
  "c-001": { operator_id: "op-101", operator_name: "Dispatcher Kwesi A.", operator_badge: "GPS-042", agency: "Police", claimed_at: "2026-09-02T08:30:00Z" },
  "c-002": { operator_id: "op-102", operator_name: "Dispatcher Sarah M.", operator_badge: "GNFS-119", agency: "Fire Service", claimed_at: "2026-09-02T09:15:00Z" },
  "c-005": { operator_id: "op-103", operator_name: "Dispatcher Emmanuel K.", operator_badge: "NAS-991", agency: "Ambulance", claimed_at: "2026-09-02T10:00:00Z" },
};

// GET messages for a specific citizen
router.get('/messages/:citizenId', requireAuth, async (req, res) => {
  try {
    const { citizenId } = req.params;
    const isDispatcher = req.authUser.user_metadata?.role === 'dispatcher' || req.authUser.user_metadata?.role === 'admin';

    // Ensure citizen can only read their own messages
    if (!isDispatcher && req.authUser.id !== citizenId) {
      return res.status(403).json({ success: false, error: 'Unauthorized to read these messages' });
    }

    let msgs = mockMessages[citizenId] || [];

    // Filter out messages deleted for citizen if requester is a citizen
    if (!isDispatcher) {
      msgs = msgs.filter(m => !m.deleted_for_citizen);
    }

    const threadOwner = mockThreadOwners[citizenId] || null;

    return res.json({ success: true, messages: msgs, thread_owner: threadOwner });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Failed to fetch messages' });
  }
});

// POST a new message
router.post('/messages/:citizenId', requireAuth, async (req, res) => {
  try {
    const { citizenId } = req.params;
    const { text, type, media_url } = req.body;
    
    if ((!text || !text.trim()) && !media_url) {
      return res.status(400).json({ success: false, error: 'Message content or media is required' });
    }

    // Determine sender type (citizen or operator)
    const isDispatcher = req.authUser.user_metadata?.role === 'dispatcher' || req.authUser.user_metadata?.role === 'admin';
    const senderRole = isDispatcher ? 'operator' : 'citizen';

    // Verify sender
    if (senderRole === 'citizen' && req.authUser.id !== citizenId) {
      return res.status(403).json({ success: false, error: 'Unauthorized to send message for this citizen' });
    }

    const msgType = type || (media_url ? (media_url.match(/\.(mp4|mov|webm)$/i) ? 'video' : 'image') : 'text');

    const opMeta = isDispatcher ? {
      operator_id: req.authUser.id || 'op-admin',
      operator_name: req.authUser.user_metadata?.full_name || req.authUser.email?.split('@')[0] || 'Dispatch Operator',
      operator_badge: req.authUser.user_metadata?.badge_id || 'DISPATCH-01',
      agency: req.authUser.user_metadata?.agency_type || 'Central Command',
    } : {};

    const newMessage = {
      id: 'msg-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
      sender: senderRole,
      sender_id: req.authUser.id,
      text: (text || '').trim(),
      type: msgType,
      media_url: media_url || null,
      is_deleted: false,
      deleted_for_citizen: false,
      created_at: new Date().toISOString(),
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      ...opMeta
    };

    if (!mockMessages[citizenId]) {
      mockMessages[citizenId] = [];
    }
    
    mockMessages[citizenId].push(newMessage);
    saveMessages();

    return res.status(201).json({ success: true, message: newMessage });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Failed to send message' });
  }
});

// CLAIM / REASSIGN THREAD OWNERSHIP
router.post('/messages/:citizenId/claim', requireAuth, async (req, res) => {
  try {
    const { citizenId } = req.params;
    const isDispatcher = req.authUser.user_metadata?.role === 'dispatcher' || req.authUser.user_metadata?.role === 'admin';

    if (!isDispatcher) {
      return res.status(403).json({ success: false, error: 'Only operators can claim threads' });
    }

    const operatorName = req.authUser.user_metadata?.full_name || req.authUser.email?.split('@')[0] || 'Dispatcher Emmanuel K.';
    const operatorBadge = req.authUser.user_metadata?.badge_id || 'DISPATCH-01';
    const agency = req.authUser.user_metadata?.agency_type || 'Central Command';

    mockThreadOwners[citizenId] = {
      operator_id: req.authUser.id,
      operator_name: operatorName,
      operator_badge: operatorBadge,
      agency: agency,
      claimed_at: new Date().toISOString()
    };

    return res.json({ success: true, thread_owner: mockThreadOwners[citizenId] });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Failed to claim thread' });
  }
});

// DELETE a specific message
router.delete('/messages/:citizenId/:messageId', requireAuth, async (req, res) => {
  try {
    const { citizenId, messageId } = req.params;
    const isDispatcher = req.authUser.user_metadata?.role === 'dispatcher' || req.authUser.user_metadata?.role === 'admin';

    const msgs = mockMessages[citizenId] || [];
    const msgIndex = msgs.findIndex(m => m.id === messageId);

    if (msgIndex === -1) {
      return res.status(404).json({ success: false, error: 'Message not found' });
    }

    const targetMsg = msgs[msgIndex];

    if (isDispatcher) {
      // Operator deletion: Tombstone across all platforms
      targetMsg.is_deleted = true;
      targetMsg.text = 'This message was deleted';
      targetMsg.media_url = null;
      targetMsg.deleted_by = 'operator';
      targetMsg.deleted_by_name = req.authUser.user_metadata?.full_name || 'Operator';
    } else if (req.authUser.id === citizenId) {
      if (targetMsg.sender === 'citizen') {
        targetMsg.is_deleted = true;
        targetMsg.text = 'This message was deleted';
        targetMsg.media_url = null;
        targetMsg.deleted_by = 'citizen';
      }
      targetMsg.deleted_for_citizen = true;
    } else {
      return res.status(403).json({ success: false, error: 'Unauthorized to delete this message' });
    }

    saveMessages();

    return res.json({ success: true, message: targetMsg });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Failed to delete message' });
  }
});

// GET summary of all active citizen message threads for dispatchers
router.get('/messages/threads/summary', requireAuth, async (req, res) => {
  try {
    const isDispatcher = req.authUser.user_metadata?.role === 'dispatcher' || req.authUser.user_metadata?.role === 'admin';
    if (!isDispatcher) {
      return res.status(403).json({ success: false, error: 'Unauthorized to view dispatch threads' });
    }

    const threads = Object.keys(mockMessages).map(citizenId => {
      const msgs = mockMessages[citizenId] || [];
      const lastMsg = msgs[msgs.length - 1] || null;
      const unreadCount = msgs.filter(m => m.sender === 'citizen' && !m.read).length;
      return {
        citizen_id: citizenId,
        total_messages: msgs.length,
        unread_count: unreadCount,
        last_message: lastMsg,
        last_active: lastMsg ? lastMsg.created_at : null,
        thread_owner: mockThreadOwners[citizenId] || null
      };
    }).sort((a, b) => new Date(b.last_active || 0).getTime() - new Date(a.last_active || 0).getTime());

    return res.json({ success: true, threads });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Failed to fetch thread summaries' });
  }
});

// GET Admin Audit Trail Logs across all operator communications & actions
router.get('/messages/audit/logs', requireAuth, async (req, res) => {
  try {
    const isDispatcher = req.authUser.user_metadata?.role === 'dispatcher' || req.authUser.user_metadata?.role === 'admin';
    if (!isDispatcher) {
      return res.status(403).json({ success: false, error: 'Unauthorized to view audit logs' });
    }

    const allOperatorMsgs = [];
    Object.keys(mockMessages).forEach(citizenId => {
      const msgs = mockMessages[citizenId] || [];
      msgs.forEach(m => {
        if (m.sender === 'operator') {
          allOperatorMsgs.push({
            ...m,
            citizen_id: citizenId
          });
        }
      });
    });

    allOperatorMsgs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return res.json({
      success: true,
      logs: allOperatorMsgs,
      thread_owners: mockThreadOwners
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Failed to fetch audit logs' });
  }
});

module.exports = router;
