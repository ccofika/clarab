const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const PushSubscription = require('../models/PushSubscription');
const { getVapidPublicKey } = require('../utils/pushNotification');
const UAParser = require('ua-parser-js');

// Get VAPID public key (no auth required)
router.get('/vapid-public-key', (req, res) => {
  const publicKey = getVapidPublicKey();
  if (!publicKey) {
    return res.status(503).json({ message: 'Push notifications not configured' });
  }
  res.json({ publicKey });
});

// Subscribe to push notifications
router.post('/subscribe', protect, async (req, res) => {
  try {
    const { subscription } = req.body;

    if (!subscription || !subscription.endpoint || !subscription.keys) {
      return res.status(400).json({ message: 'Invalid subscription object' });
    }

    // Parse user agent for device info
    const parser = new UAParser(req.get('user-agent'));
    const uaResult = parser.getResult();

    const deviceInfo = {
      userAgent: req.get('user-agent'),
      browser: `${uaResult.browser.name || 'Unknown'} ${uaResult.browser.version || ''}`.trim(),
      os: `${uaResult.os.name || 'Unknown'} ${uaResult.os.version || ''}`.trim(),
      deviceType: uaResult.device.type || 'desktop'
    };

    // Save subscription
    const savedSubscription = await PushSubscription.saveSubscription(
      req.user._id,
      subscription,
      deviceInfo
    );

    res.status(201).json({
      message: 'Push subscription saved successfully',
      subscriptionId: savedSubscription._id
    });
  } catch (error) {
    console.error('Error saving push subscription:', error);

    // Handle duplicate key error gracefully
    if (error.code === 11000) {
      return res.json({ message: 'Subscription already exists' });
    }

    res.status(500).json({ message: error.message });
  }
});

// Unsubscribe from push notifications
router.post('/unsubscribe', protect, async (req, res) => {
  try {
    const { endpoint } = req.body;

    if (!endpoint) {
      return res.status(400).json({ message: 'Endpoint is required' });
    }

    await PushSubscription.removeByEndpoint(req.user._id, endpoint);

    res.json({ message: 'Push subscription removed successfully' });
  } catch (error) {
    console.error('Error removing push subscription:', error);
    res.status(500).json({ message: error.message });
  }
});

// Get user's push subscriptions (for debugging/settings)
router.get('/subscriptions', protect, async (req, res) => {
  try {
    const subscriptions = await PushSubscription.find({ user: req.user._id })
      .select('deviceInfo isActive createdAt updatedAt lastPushAt failedAttempts')
      .sort({ updatedAt: -1 });

    res.json(subscriptions);
  } catch (error) {
    console.error('Error fetching push subscriptions:', error);
    res.status(500).json({ message: error.message });
  }
});

// Remove all push subscriptions for user (logout from all)
router.delete('/subscriptions', protect, async (req, res) => {
  try {
    const result = await PushSubscription.removeAllForUser(req.user._id);

    res.json({
      message: 'All push subscriptions removed',
      count: result.deletedCount
    });
  } catch (error) {
    console.error('Error removing push subscriptions:', error);
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
