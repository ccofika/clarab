const mongoose = require('mongoose');

const chatMessageSchema = new mongoose.Schema(
  {
    channel: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ChatChannel',
      required: true,
      index: true
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    content: {
      type: String,
      required: true,
      trim: true,
      maxlength: 10000
    },
    type: {
      type: String,
      enum: ['text', 'file', 'voice', 'element', 'ticket'],
      required: true,
      default: 'text'
    },
    metadata: {
      // For file messages
      files: [
        {
          url: {
            type: String,
            required: true
          },
          name: {
            type: String,
            required: true
          },
          size: {
            type: Number,
            required: true
          },
          type: {
            type: String,
            required: true
          },
          thumbnailUrl: {
            type: String
          }
        }
      ],
      // For shared canvas elements
      element: {
        elementId: {
          type: mongoose.Schema.Types.ObjectId
        },
        workspaceId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Workspace'
        },
        workspaceName: {
          type: String
        },
        type: {
          type: String
        },
        title: {
          type: String
        },
        preview: {
          type: String
        },
        description: {
          type: String
        },
        macro: {
          type: String
        },
        example: {
          title: String,
          messages: [{
            type: {
              type: String,
              enum: ['user', 'agent']
            },
            text: String
          }]
        },
        exampleIndex: {
          type: Number,
          default: null
        },
        thumbnailUrl: {
          type: String
        }
      },
      // For QA tickets
      ticket: {
        ticketId: {
          type: mongoose.Schema.Types.ObjectId
        },
        title: {
          type: String
        },
        priority: {
          type: String,
          enum: ['low', 'medium', 'high', 'critical']
        },
        status: {
          type: String
        },
        assignee: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User'
        }
      },
      // For voice messages
      voice: {
        duration: {
          type: Number // in seconds
        },
        waveform: {
          type: [Number] // Array of amplitude values for visualization
        }
      },
      // Reply/thread info
      replyTo: {
        messageId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'ChatMessage'
        },
        content: {
          type: String
        },
        sender: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User'
        }
      },
      // For thread replies sent to channel ("Also send to channel")
      alsoSendToChannel: {
        type: Boolean,
        default: false
      },
      threadParent: {
        messageId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'ChatMessage'
        },
        content: {
          type: String
        },
        sender: {
          _id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
          },
          name: {
            type: String
          }
        },
        replyPosition: {
          type: Number
        }
      }
    },
    reactions: [
      {
        emoji: {
          type: String,
          required: true
        },
        users: [
          {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
          }
        ]
      }
    ],
    isEdited: {
      type: Boolean,
      default: false
    },
    editedAt: {
      type: Date,
      default: null
    },
    isDeleted: {
      type: Boolean,
      default: false
    },
    deletedAt: {
      type: Date,
      default: null
    },
    readBy: [
      {
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
          required: true
        },
        readAt: {
          type: Date,
          default: Date.now
        }
      }
    ],
    isPinned: {
      type: Boolean,
      default: false
    },
    pinnedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    pinnedAt: {
      type: Date,
      default: null
    },
    bookmarkedBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }
    ],
    mentions: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }
    ],
    // Thread support
    parentMessage: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ChatMessage',
      default: null,
      index: true
    },
    isThreadReply: {
      type: Boolean,
      default: false
    },
    replyCount: {
      type: Number,
      default: 0
    },
    threadParticipants: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }
    ],
    lastReplyAt: {
      type: Date,
      default: null
    },
    // Thread notification settings per user
    threadFollowers: [
      {
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User'
        },
        following: {
          type: Boolean,
          default: true
        },
        lastReadAt: {
          type: Date,
          default: null
        }
      }
    ]
  },
  {
    timestamps: true
  }
);

// Compound index for efficient message queries
chatMessageSchema.index({ channel: 1, createdAt: -1 });
chatMessageSchema.index({ sender: 1, createdAt: -1 });
chatMessageSchema.index({ isPinned: 1, channel: 1 });
chatMessageSchema.index({ 'readBy.userId': 1 });
chatMessageSchema.index({ mentions: 1 });
// Thread indexes
chatMessageSchema.index({ parentMessage: 1, createdAt: 1 });
chatMessageSchema.index({ replyCount: -1, lastReplyAt: -1 });
chatMessageSchema.index({ threadParticipants: 1 });
chatMessageSchema.index({ 'threadFollowers.userId': 1 });

// Text index for search functionality
chatMessageSchema.index({ content: 'text' });

// Method to check if message is read by user
chatMessageSchema.methods.isReadBy = function (userId) {
  return this.readBy.some(
    (read) => read.userId.toString() === userId.toString()
  );
};

// Method to add reaction
chatMessageSchema.methods.addReaction = function (emoji, userId) {
  const existingReaction = this.reactions.find((r) => r.emoji === emoji);

  if (existingReaction) {
    if (!existingReaction.users.includes(userId)) {
      existingReaction.users.push(userId);
    }
  } else {
    this.reactions.push({ emoji, users: [userId] });
  }

  return this.save();
};

// Method to remove reaction
chatMessageSchema.methods.removeReaction = function (emoji, userId) {
  const reaction = this.reactions.find((r) => r.emoji === emoji);

  if (reaction) {
    reaction.users = reaction.users.filter(
      (id) => id.toString() !== userId.toString()
    );

    if (reaction.users.length === 0) {
      this.reactions = this.reactions.filter((r) => r.emoji !== emoji);
    }
  }

  return this.save();
};

// Method to mark as read
chatMessageSchema.methods.markAsRead = function (userId) {
  if (!this.isReadBy(userId)) {
    this.readBy.push({ userId, readAt: new Date() });
    return this.save();
  }
  return Promise.resolve(this);
};

// Static method to get unread count for user in channel
chatMessageSchema.statics.getUnreadCount = async function (channelId, userId) {
  return this.countDocuments({
    channel: channelId,
    'readBy.userId': { $ne: userId },
    sender: { $ne: userId },
    isDeleted: false
  });
};

// Static method to mark all messages in channel as read
chatMessageSchema.statics.markAllAsRead = async function (channelId, userId) {
  return this.updateMany(
    {
      channel: channelId,
      'readBy.userId': { $ne: userId },
      sender: { $ne: userId },
      isDeleted: false
    },
    {
      $push: { readBy: { userId, readAt: new Date() } }
    }
  );
};

// Pre-save hook to extract mentions from content
chatMessageSchema.pre('save', function (next) {
  if (this.isModified('content') && this.type === 'text') {
    // Extract @mentions from content
    const mentionRegex = /@\[([^\]]+)\]\(([a-f0-9]{24})\)/g;
    const mentions = [];
    let match;

    while ((match = mentionRegex.exec(this.content)) !== null) {
      mentions.push(match[2]);
    }

    this.mentions = [...new Set(mentions)]; // Remove duplicates
  }
  next();
});

// Static method to get all threads a user participates in
chatMessageSchema.statics.getUserThreads = async function (userId, options = {}) {
  const { limit = 20, skip = 0, channelIds = [] } = options;

  const query = {
    $or: [
      { sender: userId, replyCount: { $gt: 0 } }, // Threads user started
      { threadParticipants: userId }, // Threads user replied to
      { 'threadFollowers.userId': userId } // Threads user follows
    ],
    parentMessage: null, // Only parent messages (thread starters)
    isDeleted: false
  };

  // Filter by channels if provided
  if (channelIds.length > 0) {
    query.channel = { $in: channelIds };
  }

  return this.find(query)
    .sort({ lastReplyAt: -1, createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate('sender', 'name avatar email')
    .populate('channel', 'name type')
    .populate('threadParticipants', 'name avatar')
    .lean();
};

// Static method to get thread replies
chatMessageSchema.statics.getThreadReplies = async function (parentMessageId, options = {}) {
  const { limit = 50, before = null } = options;

  const query = {
    parentMessage: parentMessageId,
    isDeleted: false
  };

  if (before) {
    query.createdAt = { $lt: new Date(before) };
  }

  return this.find(query)
    .sort({ createdAt: 1 })
    .limit(limit)
    .populate('sender', 'name avatar email')
    .populate('metadata.replyTo.sender', 'name avatar')
    .lean();
};

// Static method to get unread thread count for a user
chatMessageSchema.statics.getUnreadThreadCount = async function (userId, channelIds = []) {
  const query = {
    $or: [
      { sender: userId, replyCount: { $gt: 0 } },
      { threadParticipants: userId },
      { 'threadFollowers.userId': userId, 'threadFollowers.following': true }
    ],
    parentMessage: null,
    isDeleted: false
  };

  if (channelIds.length > 0) {
    query.channel = { $in: channelIds };
  }

  const threads = await this.find(query).lean();

  let unreadCount = 0;
  for (const thread of threads) {
    const follower = thread.threadFollowers?.find(
      f => f.userId.toString() === userId.toString()
    );
    const lastReadAt = follower?.lastReadAt || new Date(0);

    if (thread.lastReplyAt && thread.lastReplyAt > lastReadAt) {
      unreadCount++;
    }
  }

  return unreadCount;
};

// Method to add a reply to thread
chatMessageSchema.methods.addThreadReply = async function (replyMessage) {
  // Update parent message
  if (!this.threadParticipants.includes(replyMessage.sender)) {
    this.threadParticipants.push(replyMessage.sender);
  }
  this.replyCount += 1;
  this.lastReplyAt = new Date();

  // Auto-follow the thread for the reply sender if not already following
  const existingFollower = this.threadFollowers.find(
    f => f.userId.toString() === replyMessage.sender.toString()
  );
  if (!existingFollower) {
    this.threadFollowers.push({
      userId: replyMessage.sender,
      following: true,
      lastReadAt: new Date()
    });
  }

  return this.save();
};

// Method to toggle thread following
chatMessageSchema.methods.toggleThreadFollow = async function (userId, follow) {
  const existingFollower = this.threadFollowers.find(
    f => f.userId.toString() === userId.toString()
  );

  if (existingFollower) {
    existingFollower.following = follow;
  } else {
    this.threadFollowers.push({
      userId,
      following: follow,
      lastReadAt: new Date()
    });
  }

  return this.save();
};

// Method to mark thread as read for user
chatMessageSchema.methods.markThreadAsRead = async function (userId) {
  const existingFollower = this.threadFollowers.find(
    f => f.userId.toString() === userId.toString()
  );

  if (existingFollower) {
    existingFollower.lastReadAt = new Date();
  } else {
    this.threadFollowers.push({
      userId,
      following: true,
      lastReadAt: new Date()
    });
  }

  return this.save();
};

const ChatMessage = mongoose.model('ChatMessage', chatMessageSchema);

module.exports = ChatMessage;
