const express = require('express');
const router = express.Router();
const {
  subscribe,
  verifySubscription,
  unsubscribe,
  updatePreferences,
  getStats,
  getSubscribers,
  deleteSubscriber
} = require('../controllers/statusSubscriptionController');
const { protect, adminOnly } = require('../middleware/auth');

// Public routes
router.route('/')
  .post(subscribe)
  .get(protect, adminOnly, getSubscribers);

router.route('/verify/:token')
  .get(verifySubscription);

router.route('/unsubscribe/:token')
  .get(unsubscribe);

router.route('/preferences/:token')
  .put(updatePreferences);

// Admin routes
router.route('/stats')
  .get(protect, adminOnly, getStats);

router.route('/:id')
  .delete(protect, adminOnly, deleteSubscriber);

module.exports = router;
