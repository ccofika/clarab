const User = require('../models/User');

// Update workspace view mode preference
exports.updateWorkspacePreference = async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const { viewMode } = req.body;

    // Validate viewMode
    if (!['edit', 'view', 'post-view'].includes(viewMode)) {
      return res.status(400).json({ message: 'Invalid view mode. Must be "edit", "view", or "post-view"' });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Initialize workspacePreferences if it doesn't exist
    if (!user.workspacePreferences) {
      user.workspacePreferences = new Map();
    }

    // Get existing preferences for this workspace
    const existingPrefs = user.workspacePreferences.get(workspaceId) || {};

    // Update only viewMode, preserve other fields
    user.workspacePreferences.set(workspaceId, {
      ...existingPrefs,
      viewMode
    });

    await user.save();

    res.json({
      message: 'Workspace preference updated successfully',
      workspaceId,
      viewMode
    });
  } catch (error) {
    console.error('Error updating workspace preference:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get workspace view mode preference
exports.getWorkspacePreference = async (req, res) => {
  try {
    const { workspaceId } = req.params;

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const preference = user.workspacePreferences?.get(workspaceId);
    const viewMode = preference?.viewMode || 'edit'; // Default to 'edit'
    const lastAccessedElement = preference?.lastAccessedElement || null;
    const lastAccessedAt = preference?.lastAccessedAt || null;

    res.json({
      workspaceId,
      viewMode,
      lastAccessedElement,
      lastAccessedAt
    });
  } catch (error) {
    console.error('Error getting workspace preference:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Update last accessed element for a workspace
exports.updateLastAccessedElement = async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const { elementId } = req.body;

    if (!elementId) {
      return res.status(400).json({ message: 'Element ID is required' });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Initialize workspacePreferences if it doesn't exist
    if (!user.workspacePreferences) {
      user.workspacePreferences = new Map();
    }

    // Get existing preferences for this workspace
    const existingPrefs = user.workspacePreferences.get(workspaceId) || {};

    // Update lastAccessedElement and timestamp, preserve other fields
    user.workspacePreferences.set(workspaceId, {
      ...existingPrefs,
      lastAccessedElement: elementId,
      lastAccessedAt: new Date()
    });

    await user.save();

    res.json({
      message: 'Last accessed element updated successfully',
      workspaceId,
      elementId,
      lastAccessedAt: new Date()
    });
  } catch (error) {
    console.error('Error updating last accessed element:', error);
    res.status(500).json({ message: 'Server error' });
  }
};
