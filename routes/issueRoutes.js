const express = require('express');
const router = express.Router();
const {
  getIssues,
  getIssue,
  createIssue,
  updateIssue,
  addUpdate,
  changeStatus,
  deleteIssue,
  getStats,
  updatePostmortem,
  getEnhancedStats,
  getCalendarIssues
} = require('../controllers/issueController');
const { protect, optionalAuth } = require('../middleware/auth');

// Public routes (anyone can view issues)
router.route('/')
  .get(optionalAuth, getIssues)
  .post(protect, createIssue);

// Stats routes
router.route('/stats')
  .get(getStats);

router.route('/enhanced-stats')
  .get(getEnhancedStats);

router.route('/calendar')
  .get(getCalendarIssues);

// Individual issue routes
router.route('/:id')
  .get(optionalAuth, getIssue)
  .put(protect, updateIssue)
  .delete(protect, deleteIssue);

router.route('/:id/updates')
  .post(protect, addUpdate);

router.route('/:id/status')
  .put(protect, changeStatus);

router.route('/:id/postmortem')
  .put(protect, updatePostmortem);

module.exports = router;
