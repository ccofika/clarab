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

// Toggle workspace favorite status
exports.toggleFavoriteWorkspace = async (req, res) => {
  try {
    const { workspaceId } = req.params;

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check if workspace exists
    const workspace = await Workspace.findById(workspaceId);
    if (!workspace) {
      return res.status(404).json({ message: 'Workspace not found' });
    }

    // Check if workspace is already favorited
    const isFavorited = user.favoriteWorkspaces.includes(workspaceId);

    if (isFavorited) {
      // Remove from favorites
      user.favoriteWorkspaces = user.favoriteWorkspaces.filter(
        id => id.toString() !== workspaceId
      );
    } else {
      // Add to favorites
      user.favoriteWorkspaces.push(workspaceId);
    }

    await user.save();

    res.json({
      message: isFavorited ? 'Workspace removed from favorites' : 'Workspace added to favorites',
      isFavorited: !isFavorited,
      favoriteWorkspaces: user.favoriteWorkspaces
    });
  } catch (error) {
    console.error('Error toggling favorite workspace:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get favorite workspaces
exports.getFavoriteWorkspaces = async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .populate({
        path: 'favoriteWorkspaces',
        populate: [
          { path: 'owner', select: 'name email' },
          { path: 'members.user', select: 'name email' }
        ]
      });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json(user.favoriteWorkspaces || []);
  } catch (error) {
    console.error('Error getting favorite workspaces:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Track recent workspace access
exports.trackRecentWorkspace = async (req, res) => {
  try {
    const { workspaceId } = req.params;

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check if workspace exists
    const workspace = await Workspace.findById(workspaceId);
    if (!workspace) {
      return res.status(404).json({ message: 'Workspace not found' });
    }

    // Remove workspace if it already exists in recent list
    user.recentWorkspaces = user.recentWorkspaces.filter(
      item => item.workspace.toString() !== workspaceId
    );

    // Add to beginning of recent list
    user.recentWorkspaces.unshift({
      workspace: workspaceId,
      lastAccessed: new Date()
    });

    // Keep only last 10 recent workspaces
    if (user.recentWorkspaces.length > 10) {
      user.recentWorkspaces = user.recentWorkspaces.slice(0, 10);
    }

    await user.save();

    res.json({
      message: 'Recent workspace tracked successfully',
      recentWorkspaces: user.recentWorkspaces
    });
  } catch (error) {
    console.error('Error tracking recent workspace:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get recent workspaces
exports.getRecentWorkspaces = async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .populate({
        path: 'recentWorkspaces.workspace',
        populate: [
          { path: 'owner', select: 'name email' },
          { path: 'members.user', select: 'name email' }
        ]
      });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Filter out null workspaces (in case some were deleted)
    const recentWorkspaces = user.recentWorkspaces
      .filter(item => item.workspace !== null)
      .map(item => ({
        ...item.workspace.toObject(),
        lastAccessed: item.lastAccessed
      }));

    res.json(recentWorkspaces);
  } catch (error) {
    console.error('Error getting recent workspaces:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Search users by name or email
exports.searchUsers = async (req, res) => {
  try {
    const { query } = req.query;
    const currentUserId = req.user._id;

    if (!query || query.trim().length === 0) {
      // Return all users if no query (limit to 20)
      const users = await User.find({ _id: { $ne: currentUserId } })
        .select('name email avatar')
        .limit(20);
      return res.json(users);
    }

    // Search by name or email (case insensitive)
    const users = await User.find({
      _id: { $ne: currentUserId }, // Exclude current user
      $or: [
        { name: { $regex: query, $options: 'i' } },
        { email: { $regex: query, $options: 'i' } }
      ]
    })
      .select('name email avatar')
      .limit(20);

    res.json(users);
  } catch (error) {
    console.error('Error searching users:', error);
    res.status(500).json({ message: 'Error searching users' });
  }
};
