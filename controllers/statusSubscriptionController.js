const StatusSubscription = require('../models/StatusSubscription');
const crypto = require('crypto');

// @desc    Subscribe to status updates
// @route   POST /api/status-subscriptions
// @access  Public
exports.subscribe = async (req, res) => {
  try {
    const { email, subscriptionType, components, severityFilter } = req.body;

    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    // Check if already subscribed
    let subscription = await StatusSubscription.findOne({ email: email.toLowerCase() });

    if (subscription) {
      if (subscription.isActive && subscription.isVerified) {
        return res.status(400).json({ message: 'This email is already subscribed' });
      }

      // Reactivate if inactive
      if (!subscription.isActive) {
        subscription.isActive = true;
        subscription.isVerified = false;
      }
    } else {
      subscription = new StatusSubscription({
        email: email.toLowerCase(),
        subscriptionType: subscriptionType || 'all',
        components: components || [],
        severityFilter: severityFilter || ['critical', 'major', 'minor']
      });
    }

    // Generate verification token
    const verificationToken = subscription.generateVerificationToken();
    await subscription.save();

    // TODO: Send verification email
    // For now, auto-verify in development
    if (process.env.NODE_ENV === 'development') {
      subscription.isVerified = true;
      subscription.verificationToken = undefined;
      subscription.verificationExpires = undefined;
      await subscription.save();

      return res.status(201).json({
        message: 'Subscribed successfully (auto-verified in development)',
        subscription: {
          email: subscription.email,
          subscriptionType: subscription.subscriptionType,
          isVerified: subscription.isVerified
        }
      });
    }

    res.status(201).json({
      message: 'Verification email sent. Please check your inbox.',
      verificationToken: process.env.NODE_ENV === 'development' ? verificationToken : undefined
    });
  } catch (error) {
    console.error('Error subscribing:', error);
    if (error.code === 11000) {
      return res.status(400).json({ message: 'This email is already subscribed' });
    }
    res.status(500).json({ message: 'Error subscribing', error: error.message });
  }
};

// @desc    Verify subscription
// @route   GET /api/status-subscriptions/verify/:token
// @access  Public
exports.verifySubscription = async (req, res) => {
  try {
    const hashedToken = crypto
      .createHash('sha256')
      .update(req.params.token)
      .digest('hex');

    const subscription = await StatusSubscription.findOne({
      verificationToken: hashedToken,
      verificationExpires: { $gt: Date.now() }
    });

    if (!subscription) {
      return res.status(400).json({ message: 'Invalid or expired verification token' });
    }

    await subscription.verify();

    res.json({ message: 'Email verified successfully. You are now subscribed to status updates.' });
  } catch (error) {
    console.error('Error verifying subscription:', error);
    res.status(500).json({ message: 'Error verifying subscription', error: error.message });
  }
};

// @desc    Unsubscribe
// @route   GET /api/status-subscriptions/unsubscribe/:token
// @access  Public
exports.unsubscribe = async (req, res) => {
  try {
    const subscription = await StatusSubscription.findOne({
      unsubscribeToken: req.params.token
    });

    if (!subscription) {
      return res.status(404).json({ message: 'Subscription not found' });
    }

    await subscription.unsubscribe();

    res.json({ message: 'You have been unsubscribed from status updates.' });
  } catch (error) {
    console.error('Error unsubscribing:', error);
    res.status(500).json({ message: 'Error unsubscribing', error: error.message });
  }
};

// @desc    Update subscription preferences
// @route   PUT /api/status-subscriptions/:token
// @access  Public (with unsubscribe token)
exports.updatePreferences = async (req, res) => {
  try {
    const { subscriptionType, components, severityFilter } = req.body;

    const subscription = await StatusSubscription.findOne({
      unsubscribeToken: req.params.token
    });

    if (!subscription) {
      return res.status(404).json({ message: 'Subscription not found' });
    }

    if (subscriptionType) subscription.subscriptionType = subscriptionType;
    if (components) subscription.components = components;
    if (severityFilter) subscription.severityFilter = severityFilter;

    await subscription.save();

    res.json({
      message: 'Preferences updated',
      subscription: {
        email: subscription.email,
        subscriptionType: subscription.subscriptionType,
        severityFilter: subscription.severityFilter
      }
    });
  } catch (error) {
    console.error('Error updating preferences:', error);
    res.status(500).json({ message: 'Error updating preferences', error: error.message });
  }
};

// @desc    Get subscription stats (Admin only)
// @route   GET /api/status-subscriptions/stats
// @access  Private (Admin only)
exports.getStats = async (req, res) => {
  try {
    const stats = await StatusSubscription.getStats();

    const byType = await StatusSubscription.aggregate([
      { $match: { isActive: true, isVerified: true } },
      { $group: { _id: '$subscriptionType', count: { $sum: 1 } } }
    ]);

    res.json({
      ...stats,
      byType: byType.reduce((acc, item) => {
        acc[item._id] = item.count;
        return acc;
      }, {})
    });
  } catch (error) {
    console.error('Error fetching subscription stats:', error);
    res.status(500).json({ message: 'Error fetching stats', error: error.message });
  }
};

// @desc    Get all subscribers (Admin only)
// @route   GET /api/status-subscriptions
// @access  Private (Admin only)
exports.getSubscribers = async (req, res) => {
  try {
    const { page = 1, limit = 50, active } = req.query;

    const query = {};
    if (active === 'true') {
      query.isActive = true;
      query.isVerified = true;
    }

    const subscribers = await StatusSubscription.find(query)
      .select('-verificationToken -verificationExpires')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await StatusSubscription.countDocuments(query);

    res.json({
      subscribers,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / limit)
    });
  } catch (error) {
    console.error('Error fetching subscribers:', error);
    res.status(500).json({ message: 'Error fetching subscribers', error: error.message });
  }
};

// @desc    Delete subscriber (Admin only)
// @route   DELETE /api/status-subscriptions/:id
// @access  Private (Admin only)
exports.deleteSubscriber = async (req, res) => {
  try {
    const subscription = await StatusSubscription.findByIdAndDelete(req.params.id);

    if (!subscription) {
      return res.status(404).json({ message: 'Subscription not found' });
    }

    res.json({ message: 'Subscriber deleted' });
  } catch (error) {
    console.error('Error deleting subscriber:', error);
    res.status(500).json({ message: 'Error deleting subscriber', error: error.message });
  }
};
