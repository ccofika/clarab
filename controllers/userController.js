const User = require('../models/User');
const Workspace = require('../models/Workspace');
const CanvasElement = require('../models/CanvasElement');
const ActivityLog = require('../models/ActivityLog');

// Get user account statistics
exports.getUserStatistics = async (req, res) => {
  try {
    const userId = req.user._id;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Count workspaces where user is owner or member
    const workspaceCount = await Workspace.countDocuments({
      $or: [
        { owner: userId },
        { members: { $elemMatch: { user: userId } } }
      ]
    });

    // Count total elements created by user
    const elementCount = await CanvasElement.countDocuments({ createdBy: userId });

    // Count login activities (from last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const loginCount = await ActivityLog.countDocuments({
      user: userId,
      module: 'auth',
      message: { $regex: /login/i },
      createdAt: { $gte: thirtyDaysAgo }
    });

    // Get last login from activity logs
    const lastLoginLog = await ActivityLog.findOne({
      user: userId,
      module: 'auth',
      message: { $regex: /login/i }
    }).sort({ createdAt: -1 });

    res.json({
      workspaceCount,
      elementCount,
      loginCount,
      lastLogin: lastLoginLog ? lastLoginLog.createdAt : null,
      memberSince: user.createdAt,
      email: user.email,
      name: user.name
    });
  } catch (error) {
    console.error('Error getting user statistics:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Reset tutorial (set tutorialCompleted to false)
exports.resetTutorial = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.tutorialCompleted = false;
    await user.save();

    res.json({
      message: 'Tutorial reset successfully',
      tutorialCompleted: false
    });
  } catch (error) {
    console.error('Error resetting tutorial:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

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

// Mark tutorial as completed
exports.markTutorialCompleted = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.tutorialCompleted = true;
    await user.save();

    res.json({
      message: 'Tutorial marked as completed successfully',
      tutorialCompleted: true
    });
  } catch (error) {
    console.error('Error marking tutorial as completed:', error);
    res.status(500).json({ message: 'Server error' });
  }
};
