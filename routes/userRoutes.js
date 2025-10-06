const express = require('express');
const router = express.Router();
const { updateWorkspacePreference, getWorkspacePreference } = require('../controllers/userController');
const { protect } = require('../middleware/auth');

// Update workspace view mode preference
router.put('/preferences/workspace/:workspaceId', protect, updateWorkspacePreference);

// Get workspace view mode preference
router.get('/preferences/workspace/:workspaceId', protect, getWorkspacePreference);

module.exports = router;
