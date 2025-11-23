const express = require('express');
const router = express.Router();
const activityController = require('../controllers/activityController');
const { protect } = require('../middleware/auth');

// All routes require authentication
router.use(protect);

// Get all activities
router.get('/', activityController.getActivities);

// Get unread counts
router.get('/unread-counts', activityController.getUnreadCounts);

// Get activities for a specific message
router.get('/message/:messageId', activityController.getMessageActivities);

// Mark activity as read
router.put('/:activityId/read', activityController.markActivityAsRead);

// Mark all activities as read
router.post('/mark-all-read', activityController.markAllAsRead);

// Mark channel activities as read
router.post('/channel/:channelId/mark-read', activityController.markChannelAsRead);

// Delete activity
router.delete('/:activityId', activityController.deleteActivity);

module.exports = router;
