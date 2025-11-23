const ChatChannel = require('../models/ChatChannel');
const ChatMessage = require('../models/ChatMessage');
const User = require('../models/User');
const mongoose = require('mongoose');
const cloudinary = require('../config/cloudinary');
const multer = require('multer');
const { Readable } = require('stream');

// QA team email whitelist
const QA_ALLOWED_EMAILS = [
  'filipkozomara@mebit.io',
  'vasilijevitorovic@mebit.io',
  'nevena@mebit.io',
  'mladenjorganovic@mebit.io'
];

// Helper function to check QA access
const hasQAAccess = (email) => {
  return email && QA_ALLOWED_EMAILS.includes(email);
};

// Get all channels for user
exports.getChannels = async (req, res) => {
  try {
    const userId = req.user._id;
    const userEmail = req.user.email;

    // Get ALL channels where user is a member (including archived)
    let channels = await ChatChannel.find({
      'members.userId': userId
    })
      .populate('members.userId', 'name email avatar')
      .populate('workspace', 'name')
      .populate('lastMessage.sender', 'name avatar')
      .sort({ 'lastMessage.timestamp': -1 });

    // Filter out QA channels if user doesn't have access
    if (!hasQAAccess(userEmail)) {
      channels = channels.filter((channel) => channel.type !== 'qa');
    }

    // Get unread counts and add isArchived flag for each channel
    const channelsWithUnread = await Promise.all(
      channels.map(async (channel) => {
        const unreadCount = await ChatMessage.getUnreadCount(
          channel._id,
          userId
        );

        // Check if this specific user has archived this channel
        const isArchived = channel.settings.archivedBy.some(
          id => id.toString() === userId.toString()
        );

        return {
          ...channel.toObject(),
          unreadCount,
          isArchived
        };
      })
    );

    res.json(channelsWithUnread);
  } catch (error) {
    console.error('Error fetching channels:', error);
    res.status(500).json({ message: 'Error fetching channels' });
  }
};

// Create a new channel
exports.createChannel = async (req, res) => {
  try {
    const { type, name, description, memberIds, workspaceId } = req.body;
    const userId = req.user._id;
    const userEmail = req.user.email;

    // Check QA access for QA channels
    if (type === 'qa' && !hasQAAccess(userEmail)) {
      return res
        .status(403)
        .json({ message: 'You do not have access to create QA channels' });
    }

    // Validate channel type
    if (!['dm', 'group', 'qa', 'workspace'].includes(type)) {
      return res.status(400).json({ message: 'Invalid channel type' });
    }

    // For DM channels, use findOrCreateDM
    if (type === 'dm') {
      if (!memberIds || memberIds.length !== 1) {
        return res
          .status(400)
          .json({ message: 'DM requires exactly one other member' });
      }

      const otherUserId = memberIds[0];
      const dmChannel = await ChatChannel.findOrCreateDM(userId, otherUserId);

      // Get unread count
      const unreadCount = await ChatMessage.getUnreadCount(dmChannel._id, userId);

      return res.status(200).json({ ...dmChannel.toObject(), unreadCount });
    }

    // Create group, QA, or workspace channel
    const members = [{ userId, role: 'admin' }];

    if (memberIds && memberIds.length > 0) {
      memberIds.forEach((memberId) => {
        if (memberId.toString() !== userId.toString()) {
          members.push({ userId: memberId, role: 'member' });
        }
      });
    }

    const channelData = {
      type,
      name,
      description,
      members,
      createdBy: userId
    };

    if (workspaceId) {
      channelData.workspace = workspaceId;
    }

    const channel = await ChatChannel.create(channelData);

    const populatedChannel = await ChatChannel.findById(channel._id)
      .populate('members.userId', 'name email avatar')
      .populate('workspace', 'name');

    res.status(201).json({ ...populatedChannel.toObject(), unreadCount: 0 });
  } catch (error) {
    console.error('Error creating channel:', error);
    res.status(500).json({ message: 'Error creating channel' });
  }
};

// Update channel
exports.updateChannel = async (req, res) => {
  try {
    const { channelId } = req.params;
    const { name, description, avatar, memberIds } = req.body;
    const userId = req.user._id;

    const channel = await ChatChannel.findById(channelId);

    if (!channel) {
      return res.status(404).json({ message: 'Channel not found' });
    }

    // Check if user is admin
    if (!channel.isAdmin(userId)) {
      return res
        .status(403)
        .json({ message: 'Only admins can update channels' });
    }

    // Update basic info
    if (name !== undefined) channel.name = name;
    if (description !== undefined) channel.description = description;
    if (avatar !== undefined) channel.avatar = avatar;

    // Update members if provided
    if (memberIds) {
      const newMembers = [
        channel.members.find(
          (m) => m.userId.toString() === userId.toString()
        ) // Keep creator as admin
      ];

      memberIds.forEach((memberId) => {
        if (memberId.toString() !== userId.toString()) {
          newMembers.push({ userId: memberId, role: 'member' });
        }
      });

      channel.members = newMembers;
    }

    await channel.save();

    const updatedChannel = await ChatChannel.findById(channelId)
      .populate('members.userId', 'name email avatar')
      .populate('workspace', 'name');

    res.json(updatedChannel);
  } catch (error) {
    console.error('Error updating channel:', error);
    res.status(500).json({ message: 'Error updating channel' });
  }
};

// Delete or leave channel
exports.deleteChannel = async (req, res) => {
  try {
    const { channelId } = req.params;
    const userId = req.user._id;

    const channel = await ChatChannel.findById(channelId);

    if (!channel) {
      return res.status(404).json({ message: 'Channel not found' });
    }

    // If user is admin, delete channel
    if (channel.isAdmin(userId)) {
      // Delete all messages in channel
      await ChatMessage.deleteMany({ channel: channelId });
      // Delete channel
      await ChatChannel.findByIdAndDelete(channelId);

      return res.json({ message: 'Channel deleted successfully' });
    }

    // Otherwise, remove user from members
    channel.members = channel.members.filter(
      (m) => m.userId.toString() !== userId.toString()
    );

    await channel.save();

    res.json({ message: 'Left channel successfully' });
  } catch (error) {
    console.error('Error deleting channel:', error);
    res.status(500).json({ message: 'Error deleting channel' });
  }
};

// Archive/unarchive channel
exports.toggleArchiveChannel = async (req, res) => {
  try {
    const { channelId } = req.params;
    const userId = req.user._id;

    const channel = await ChatChannel.findById(channelId);

    if (!channel) {
      return res.status(404).json({ message: 'Channel not found' });
    }

    if (!channel.isMember(userId)) {
      return res.status(403).json({ message: 'Not a member of this channel' });
    }

    // Toggle archive status for this user
    const isArchived = channel.settings.archivedBy.includes(userId);

    if (isArchived) {
      channel.settings.archivedBy = channel.settings.archivedBy.filter(
        (id) => id.toString() !== userId.toString()
      );
    } else {
      channel.settings.archivedBy.push(userId);
    }

    await channel.save();

    res.json({ archived: !isArchived });
  } catch (error) {
    console.error('Error archiving channel:', error);
    res.status(500).json({ message: 'Error archiving channel' });
  }
};

// Get messages for a channel
exports.getMessages = async (req, res) => {
  try {
    const { channelId } = req.params;
    const { limit = 50, before } = req.query;
    const userId = req.user._id;

    const channel = await ChatChannel.findById(channelId);

    if (!channel) {
      return res.status(404).json({ message: 'Channel not found' });
    }

    if (!channel.isMember(userId)) {
      return res.status(403).json({ message: 'Not a member of this channel' });
    }

    // Build query
    const query = {
      channel: channelId,
      isDeleted: false
    };

    if (before) {
      query.createdAt = { $lt: new Date(before) };
    }

    const messages = await ChatMessage.find(query)
      .populate('sender', 'name email avatar')
      .populate('metadata.replyTo.sender', 'name avatar')
      .populate('reactions.users', 'name avatar')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));

    // Get pinned messages separately
    const pinnedMessages = await ChatMessage.find({
      channel: channelId,
      isPinned: true,
      isDeleted: false
    })
      .populate('sender', 'name email avatar')
      .populate('pinnedBy', 'name')
      .sort({ pinnedAt: -1 });

    res.json({
      messages: messages.reverse(), // Reverse to get chronological order
      pinnedMessages,
      hasMore: messages.length === parseInt(limit)
    });
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ message: 'Error fetching messages' });
  }
};

// Send a message
exports.sendMessage = async (req, res) => {
  try {
    const { channelId, content, type, metadata } = req.body;
    const userId = req.user._id;

    const channel = await ChatChannel.findById(channelId);

    if (!channel) {
      return res.status(404).json({ message: 'Channel not found' });
    }

    if (!channel.isMember(userId)) {
      return res.status(403).json({ message: 'Not a member of this channel' });
    }

    // Process reply metadata
    let processedMetadata = metadata || {};

    if (metadata && metadata.replyTo) {
      // If replyTo is just an ID string, fetch the message and populate metadata
      const replyToMessage = await ChatMessage.findById(metadata.replyTo)
        .populate('sender', 'name avatar');

      if (replyToMessage) {
        processedMetadata.replyTo = {
          messageId: replyToMessage._id,
          content: replyToMessage.content,
          sender: replyToMessage.sender._id
        };
      }
    }

    // Create message
    const message = await ChatMessage.create({
      channel: channelId,
      sender: userId,
      content,
      type: type || 'text',
      metadata: processedMetadata,
      readBy: [{ userId, readAt: new Date() }] // Sender has read it
    });

    // Update channel's last message and auto-unarchive if archived
    channel.lastMessage = {
      content: content.substring(0, 100),
      sender: userId,
      timestamp: new Date(),
      type: type || 'text'
    };

    // Auto-unarchive channel for the sender when a message is sent
    if (channel.settings.archivedBy.some(id => id.toString() === userId.toString())) {
      channel.settings.archivedBy = channel.settings.archivedBy.filter(
        id => id.toString() !== userId.toString()
      );
    }

    await channel.save();

    // Populate sender info
    const populatedMessage = await ChatMessage.findById(message._id)
      .populate('sender', 'name email avatar')
      .populate('metadata.replyTo.sender', 'name avatar');

    res.status(201).json(populatedMessage);
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ message: 'Error sending message' });
  }
};

// Edit message
exports.editMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const { content } = req.body;
    const userId = req.user._id;

    const message = await ChatMessage.findById(messageId);

    if (!message) {
      return res.status(404).json({ message: 'Message not found' });
    }

    if (message.sender.toString() !== userId.toString()) {
      return res
        .status(403)
        .json({ message: 'You can only edit your own messages' });
    }

    message.content = content;
    message.isEdited = true;
    message.editedAt = new Date();

    await message.save();

    const updatedMessage = await ChatMessage.findById(messageId)
      .populate('sender', 'name email avatar')
      .populate('metadata.replyTo.sender', 'name avatar');

    res.json(updatedMessage);
  } catch (error) {
    console.error('Error editing message:', error);
    res.status(500).json({ message: 'Error editing message' });
  }
};

// Delete message
exports.deleteMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const userId = req.user._id;

    const message = await ChatMessage.findById(messageId);

    if (!message) {
      return res.status(404).json({ message: 'Message not found' });
    }

    // Check if user is sender or channel admin
    const channel = await ChatChannel.findById(message.channel);
    const isSender = message.sender.toString() === userId.toString();
    const isAdmin = channel.isAdmin(userId);

    if (!isSender && !isAdmin) {
      return res.status(403).json({
        message: 'You can only delete your own messages or be a channel admin'
      });
    }

    message.isDeleted = true;
    message.deletedAt = new Date();
    message.content = 'This message has been deleted';

    await message.save();

    res.json({ message: 'Message deleted successfully' });
  } catch (error) {
    console.error('Error deleting message:', error);
    res.status(500).json({ message: 'Error deleting message' });
  }
};

// Add reaction to message
exports.addReaction = async (req, res) => {
  try {
    const { messageId } = req.params;
    const { emoji } = req.body;
    const userId = req.user._id;

    const message = await ChatMessage.findById(messageId);

    if (!message) {
      return res.status(404).json({ message: 'Message not found' });
    }

    await message.addReaction(emoji, userId);

    const updatedMessage = await ChatMessage.findById(messageId)
      .populate('sender', 'name email avatar')
      .populate('reactions.users', 'name avatar');

    res.json(updatedMessage);
  } catch (error) {
    console.error('Error adding reaction:', error);
    res.status(500).json({ message: 'Error adding reaction' });
  }
};

// Remove reaction from message
exports.removeReaction = async (req, res) => {
  try {
    const { messageId } = req.params;
    const { emoji } = req.body;
    const userId = req.user._id;

    const message = await ChatMessage.findById(messageId);

    if (!message) {
      return res.status(404).json({ message: 'Message not found' });
    }

    await message.removeReaction(emoji, userId);

    const updatedMessage = await ChatMessage.findById(messageId)
      .populate('sender', 'name email avatar')
      .populate('reactions.users', 'name avatar');

    res.json(updatedMessage);
  } catch (error) {
    console.error('Error removing reaction:', error);
    res.status(500).json({ message: 'Error removing reaction' });
  }
};

// Mark messages as read
exports.markAsRead = async (req, res) => {
  try {
    const { channelId } = req.params;
    const userId = req.user._id;

    await ChatMessage.markAllAsRead(channelId, userId);

    res.json({ message: 'Messages marked as read' });
  } catch (error) {
    console.error('Error marking messages as read:', error);
    res.status(500).json({ message: 'Error marking messages as read' });
  }
};

// Toggle pin message
exports.togglePinMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const userId = req.user._id;

    const message = await ChatMessage.findById(messageId);

    if (!message) {
      return res.status(404).json({ message: 'Message not found' });
    }

    // Check if user is channel admin
    const channel = await ChatChannel.findById(message.channel);
    if (!channel.isAdmin(userId)) {
      return res
        .status(403)
        .json({ message: 'Only admins can pin messages' });
    }

    message.isPinned = !message.isPinned;
    message.pinnedBy = message.isPinned ? userId : null;
    message.pinnedAt = message.isPinned ? new Date() : null;

    await message.save();

    const updatedMessage = await ChatMessage.findById(messageId)
      .populate('sender', 'name email avatar')
      .populate('pinnedBy', 'name');

    res.json(updatedMessage);
  } catch (error) {
    console.error('Error pinning message:', error);
    res.status(500).json({ message: 'Error pinning message' });
  }
};

// Search messages
exports.searchMessages = async (req, res) => {
  try {
    const { query, channelId, limit = 20 } = req.query;
    const userId = req.user._id;

    if (!query) {
      return res.status(400).json({ message: 'Search query is required' });
    }

    // Build search query
    const searchQuery = {
      $text: { $search: query },
      isDeleted: false
    };

    // Filter by channel if provided
    if (channelId) {
      const channel = await ChatChannel.findById(channelId);
      if (!channel || !channel.isMember(userId)) {
        return res.status(403).json({ message: 'Access denied' });
      }
      searchQuery.channel = channelId;
    } else {
      // Search only in channels user is member of
      const userChannels = await ChatChannel.find({
        'members.userId': userId
      }).select('_id');

      searchQuery.channel = { $in: userChannels.map((c) => c._id) };
    }

    const messages = await ChatMessage.find(searchQuery, {
      score: { $meta: 'textScore' }
    })
      .sort({ score: { $meta: 'textScore' } })
      .limit(parseInt(limit))
      .populate('sender', 'name email avatar')
      .populate('channel', 'name type');

    res.json(messages);
  } catch (error) {
    console.error('Error searching messages:', error);
    res.status(500).json({ message: 'Error searching messages' });
  }
};

// Toggle bookmark message
exports.toggleBookmark = async (req, res) => {
  try {
    const { messageId } = req.params;
    const userId = req.user._id;

    const message = await ChatMessage.findById(messageId);

    if (!message) {
      return res.status(404).json({ message: 'Message not found' });
    }

    const isBookmarked = message.bookmarkedBy.includes(userId);

    if (isBookmarked) {
      message.bookmarkedBy = message.bookmarkedBy.filter(
        (id) => id.toString() !== userId.toString()
      );
    } else {
      message.bookmarkedBy.push(userId);
    }

    await message.save();

    res.json({ bookmarked: !isBookmarked });
  } catch (error) {
    console.error('Error bookmarking message:', error);
    res.status(500).json({ message: 'Error bookmarking message' });
  }
};

// Get user's bookmarked messages
exports.getBookmarkedMessages = async (req, res) => {
  try {
    const userId = req.user._id;
    const { limit = 50 } = req.query;

    const messages = await ChatMessage.find({
      bookmarkedBy: userId,
      isDeleted: false
    })
      .populate('sender', 'name email avatar')
      .populate('channel', 'name type')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));

    res.json(messages);
  } catch (error) {
    console.error('Error fetching bookmarked messages:', error);
    res.status(500).json({ message: 'Error fetching bookmarked messages' });
  }
};

// Mute/unmute channel
exports.toggleMuteChannel = async (req, res) => {
  try {
    const { channelId } = req.params;
    const { duration } = req.body; // Duration in hours, null to unmute
    const userId = req.user._id;

    const channel = await ChatChannel.findById(channelId);

    if (!channel) {
      return res.status(404).json({ message: 'Channel not found' });
    }

    if (!channel.isMember(userId)) {
      return res.status(403).json({ message: 'Not a member of this channel' });
    }

    const member = channel.members.find(
      (m) => m.userId.toString() === userId.toString()
    );

    if (duration === null || duration === 0) {
      member.mutedUntil = null;
    } else {
      const mutedUntil = new Date();
      mutedUntil.setHours(mutedUntil.getHours() + (duration || 24));
      member.mutedUntil = mutedUntil;
    }

    await channel.save();

    res.json({ muted: member.mutedUntil !== null, mutedUntil: member.mutedUntil });
  } catch (error) {
    console.error('Error muting channel:', error);
    res.status(500).json({ message: 'Error muting channel' });
  }
};

// Configure multer for chat file uploads
const storage = multer.memoryStorage();
const uploadFile = multer({
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max file size for chat files
  }
}).single('file');

// Upload file to Cloudinary for chat
exports.uploadChatFile = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file provided' });
    }

    const userId = req.user._id;
    const file = req.file;

    // Determine resource type based on mimetype
    let resourceType = 'auto';
    if (file.mimetype.startsWith('image/')) {
      resourceType = 'image';
    } else if (file.mimetype.startsWith('video/')) {
      resourceType = 'video';
    } else {
      resourceType = 'raw'; // For PDFs, documents, etc.
    }

    // Convert buffer to stream
    const stream = Readable.from(file.buffer);

    // Upload to Cloudinary
    const uploadPromise = new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: 'clara/chats', // Chat files folder
          resource_type: resourceType,
          public_id: `${userId}_${Date.now()}_${file.originalname.split('.')[0]}`,
        },
        (error, result) => {
          if (error) {
            reject(error);
          } else {
            resolve(result);
          }
        }
      );

      stream.pipe(uploadStream);
    });

    const result = await uploadPromise;

    // Return file data
    res.status(200).json({
      success: true,
      file: {
        url: result.secure_url,
        publicId: result.public_id,
        format: result.format,
        resourceType: result.resource_type,
        bytes: result.bytes,
        originalName: file.originalname,
        mimeType: file.mimetype,
        createdAt: result.created_at
      }
    });
  } catch (error) {
    console.error('Error uploading file to Cloudinary:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload file',
      error: error.message
    });
  }
};

module.exports.uploadFile = uploadFile;
