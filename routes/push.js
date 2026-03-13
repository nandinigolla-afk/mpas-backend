'use strict';
const express = require('express');
const router  = express.Router();
const { protect } = require('../middleware/auth');
const User    = require('../models/User');
const { getVapidPublicKey } = require('../config/webpush');

// GET /api/push/vapid-public-key — frontend needs this to subscribe
router.get('/vapid-public-key', (_req, res) => {
  const key = getVapidPublicKey();
  if (!key) return res.status(503).json({ success: false, message: 'Push not configured' });
  res.json({ success: true, publicKey: key });
});

// POST /api/push/subscribe — save user's push subscription
router.post('/subscribe', protect, async (req, res) => {
  try {
    const { subscription } = req.body;
    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ success: false, message: 'Invalid subscription' });
    }
    await User.findByIdAndUpdate(req.user._id, { pushSubscription: subscription });
    console.log(`🔔 Push subscription saved for user ${req.user._id}`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/push/unsubscribe — remove subscription
router.delete('/unsubscribe', protect, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user._id, { pushSubscription: null });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
