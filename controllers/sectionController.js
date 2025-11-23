const ChannelSection = require('../models/ChannelSection');
const ChatChannel = require('../models/ChatChannel');

// Get all sections for user
exports.getSections = async (req, res) => {
  try {
    const userId = req.user._id;

    const sections = await ChannelSection.getUserSections(userId);

    res.json({
      success: true,
      sections
    });
  } catch (error) {
    console.error('Error fetching sections:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch sections',
      error: error.message
    });
  }
};

// Create new section
exports.createSection = async (req, res) => {
  try {
    const userId = req.user._id;
    const { name, emoji, color } = req.body;

    if (!name || name.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Section name is required'
      });
    }

    // Get current max order
    const existingSections = await ChannelSection.find({ userId }).sort({ order: -1 }).limit(1);
    const maxOrder = existingSections.length > 0 ? existingSections[0].order : 0;

    const section = new ChannelSection({
      userId,
      name: name.trim(),
      emoji: emoji || null,
      color: color || null,
      order: maxOrder + 1,
      channels: []
    });

    await section.save();

    res.status(201).json({
      success: true,
      section
    });
  } catch (error) {
    console.error('Error creating section:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create section',
      error: error.message
    });
  }
};

// Update section
exports.updateSection = async (req, res) => {
  try {
    const userId = req.user._id;
    const { sectionId } = req.params;
    const { name, emoji, color } = req.body;

    const section = await ChannelSection.findOne({ _id: sectionId, userId });

    if (!section) {
      return res.status(404).json({
        success: false,
        message: 'Section not found'
      });
    }

    if (name !== undefined) section.name = name.trim();
    if (emoji !== undefined) section.emoji = emoji;
    if (color !== undefined) section.color = color;

    await section.save();

    res.json({
      success: true,
      section
    });
  } catch (error) {
    console.error('Error updating section:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update section',
      error: error.message
    });
  }
};

// Delete section
exports.deleteSection = async (req, res) => {
  try {
    const userId = req.user._id;
    const { sectionId } = req.params;

    const section = await ChannelSection.findOneAndDelete({ _id: sectionId, userId });

    if (!section) {
      return res.status(404).json({
        success: false,
        message: 'Section not found'
      });
    }

    res.json({
      success: true,
      message: 'Section deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting section:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete section',
      error: error.message
    });
  }
};

// Add channel to section
exports.addChannelToSection = async (req, res) => {
  try {
    const userId = req.user._id;
    const { sectionId } = req.params;
    const { channelId } = req.body;

    // Verify section ownership
    const section = await ChannelSection.findOne({ _id: sectionId, userId });

    if (!section) {
      return res.status(404).json({
        success: false,
        message: 'Section not found'
      });
    }

    // Verify channel exists and user is a member
    const channel = await ChatChannel.findOne({
      _id: channelId,
      'members.userId': userId
    });

    if (!channel) {
      return res.status(404).json({
        success: false,
        message: 'Channel not found or not a member'
      });
    }

    // Remove channel from other sections first
    await ChannelSection.updateMany(
      { userId, channels: channelId },
      { $pull: { channels: channelId } }
    );

    // Add to new section
    await section.addChannel(channelId);

    const updatedSection = await ChannelSection.findById(sectionId)
      .populate({
        path: 'channels',
        populate: [
          { path: 'members.userId', select: 'name email avatar' },
          { path: 'lastMessage.sender', select: 'name avatar' }
        ]
      });

    res.json({
      success: true,
      section: updatedSection
    });
  } catch (error) {
    console.error('Error adding channel to section:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add channel to section',
      error: error.message
    });
  }
};

// Remove channel from section
exports.removeChannelFromSection = async (req, res) => {
  try {
    const userId = req.user._id;
    const { sectionId, channelId } = req.params;

    const section = await ChannelSection.findOne({ _id: sectionId, userId });

    if (!section) {
      return res.status(404).json({
        success: false,
        message: 'Section not found'
      });
    }

    await section.removeChannel(channelId);

    res.json({
      success: true,
      message: 'Channel removed from section'
    });
  } catch (error) {
    console.error('Error removing channel from section:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove channel from section',
      error: error.message
    });
  }
};

// Toggle section collapse
exports.toggleSectionCollapse = async (req, res) => {
  try {
    const userId = req.user._id;
    const { sectionId } = req.params;

    const section = await ChannelSection.findOne({ _id: sectionId, userId });

    if (!section) {
      return res.status(404).json({
        success: false,
        message: 'Section not found'
      });
    }

    await section.toggleCollapse();

    res.json({
      success: true,
      isCollapsed: section.isCollapsed
    });
  } catch (error) {
    console.error('Error toggling section collapse:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to toggle section collapse',
      error: error.message
    });
  }
};

// Reorder sections
exports.reorderSections = async (req, res) => {
  try {
    const userId = req.user._id;
    const { sectionOrders } = req.body;
    // sectionOrders: [{ sectionId, order }, ...]

    if (!Array.isArray(sectionOrders)) {
      return res.status(400).json({
        success: false,
        message: 'sectionOrders must be an array'
      });
    }

    await ChannelSection.reorderSections(userId, sectionOrders);

    const sections = await ChannelSection.getUserSections(userId);

    res.json({
      success: true,
      sections
    });
  } catch (error) {
    console.error('Error reordering sections:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reorder sections',
      error: error.message
    });
  }
};
