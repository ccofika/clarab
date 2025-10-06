const User = require('../models/User');

// Update workspace view mode preference
exports.updateWorkspacePreference = async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const { viewMode } = req.body;

    // Validate viewMode
    if (!['edit', 'view'].includes(viewMode)) {
      return res.status(400).json({ message: 'Invalid view mode. Must be "edit" or "view"' });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Initialize workspacePreferences if it doesn't exist
    if (!user.workspacePreferences) {
      user.workspacePreferences = new Map();
    }

    // Set the preference for this workspace
    user.workspacePreferences.set(workspaceId, { viewMode });

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

    res.json({ workspaceId, viewMode });
  } catch (error) {
    console.error('Error getting workspace preference:', error);
    res.status(500).json({ message: 'Server error' });
  }
};
