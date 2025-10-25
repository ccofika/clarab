const express = require('express');
const router = express.Router();
const {
  updateWorkspacePreference,
  getWorkspacePreference,
  updateLastAccessedElement,
  markTutorialCompleted
} = require('../controllers/userController');
const { protect } = require('../middleware/auth');

// Update workspace view mode preference
router.put('/preferences/workspace/:workspaceId', protect, updateWorkspacePreference);

// Get workspace view mode preference
router.get('/preferences/workspace/:workspaceId', protect, getWorkspacePreference);

// Update last accessed element for a workspace
router.put('/preferences/workspace/:workspaceId/last-accessed', protect, updateLastAccessedElement);

// Mark tutorial as completed
router.post('/tutorial-completed', protect, markTutorialCompleted);

module.exports = router;
