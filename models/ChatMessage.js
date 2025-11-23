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

const ChatMessage = mongoose.model('ChatMessage', chatMessageSchema);

module.exports = ChatMessage;
