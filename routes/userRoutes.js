const express = require('express');
const router = express.Router();
const {
  updateWorkspacePreference,
  getWorkspacePreference,
  updateLastAccessedElement,
  markTutorialCompleted,
  getUserStatistics,
  resetTutorial,
  toggleFavoriteWorkspace,
  getFavoriteWorkspaces,
  trackRecentWorkspace,
  getRecentWorkspaces
} = require('../controllers/userController');
const { protect } = require('../middleware/auth');

// Get user account statistics
router.get('/statistics', protect, getUserStatistics);

// Reset tutorial
router.post('/tutorial-reset', protect, resetTutorial);

// Update workspace view mode preference
router.put('/preferences/workspace/:workspaceId', protect, updateWorkspacePreference);

// Get workspace view mode preference
router.get('/preferences/workspace/:workspaceId', protect, getWorkspacePreference);

// Update last accessed element for a workspace
router.put('/preferences/workspace/:workspaceId/last-accessed', protect, updateLastAccessedElement);

// Mark tutorial as completed
router.post('/tutorial-completed', protect, markTutorialCompleted);

// Toggle workspace favorite status
router.post('/favorites/workspace/:workspaceId', protect, toggleFavoriteWorkspace);

// Get favorite workspaces
router.get('/favorites/workspaces', protect, getFavoriteWorkspaces);

// Track recent workspace access
router.post('/recent/workspace/:workspaceId', protect, trackRecentWorkspace);

// Get recent workspaces
router.get('/recent/workspaces', protect, getRecentWorkspaces);

module.exports = router;
