const mongoose = require('mongoose');

const chatChannelSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['dm', 'group', 'qa', 'workspace'],
      required: true,
      default: 'group'
    },
    name: {
      type: String,
      trim: true
    },
    description: {
      type: String,
      trim: true,
      default: ''
    },
    avatar: {
      type: String,
      default: null
    },
    members: [
      {
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
          required: true
        },
        role: {
          type: String,
          enum: ['admin', 'member'],
          default: 'member'
        },
        joinedAt: {
          type: Date,
          default: Date.now
        },
        mutedUntil: {
          type: Date,
          default: null
        }
      }
    ],
    workspace: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Workspace',
      default: null
    },
    settings: {
      isPinned: {
        type: Boolean,
        default: false
      },
      isArchived: {
        type: Boolean,
        default: false
      },
      archivedBy: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User'
        }
      ]
    },
    lastMessage: {
      content: {
        type: String,
        default: ''
      },
      sender: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
      },
      timestamp: {
        type: Date,
        default: Date.now
      },
      type: {
        type: String,
        enum: ['text', 'file', 'voice', 'element', 'ticket'],
        default: 'text'
      }
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    }
  },
  {
    timestamps: true
  }
);

// Index for efficient queries
chatChannelSchema.index({ 'members.userId': 1 });
chatChannelSchema.index({ type: 1 });
chatChannelSchema.index({ workspace: 1 });
chatChannelSchema.index({ 'lastMessage.timestamp': -1 });

// Virtual for DM channel name generation
chatChannelSchema.virtual('displayName').get(function () {
  if (this.type === 'dm' && !this.name) {
    return 'Direct Message';
  }
  return this.name || 'Unnamed Channel';
});

// Method to check if user is member
chatChannelSchema.methods.isMember = function (userId) {
  return this.members.some(
    (member) => member.userId.toString() === userId.toString()
  );
};

// Method to check if user is admin
chatChannelSchema.methods.isAdmin = function (userId) {
  const member = this.members.find(
    (m) => m.userId.toString() === userId.toString()
  );
  return member && member.role === 'admin';
};

// Method to get user's mute status
chatChannelSchema.methods.isMuted = function (userId) {
  const member = this.members.find(
    (m) => m.userId.toString() === userId.toString()
  );
  if (!member || !member.mutedUntil) return false;
  return new Date(member.mutedUntil) > new Date();
};

// Static method to find or create DM channel
chatChannelSchema.statics.findOrCreateDM = async function (user1Id, user2Id) {
  // Check if DM already exists
  let dmChannel = await this.findOne({
    type: 'dm',
    'members.userId': { $all: [user1Id, user2Id] },
    $expr: { $eq: [{ $size: '$members' }, 2] }
  }).populate('members.userId', 'name email avatar');

  if (dmChannel) {
    return dmChannel;
  }

  // Create new DM channel
  dmChannel = await this.create({
    type: 'dm',
    members: [
      { userId: user1Id, role: 'member' },
      { userId: user2Id, role: 'member' }
    ],
    createdBy: user1Id
  });

  return dmChannel.populate('members.userId', 'name email avatar');
};

// Pre-save hook to set default channel name for group chats
chatChannelSchema.pre('save', function (next) {
  if (this.type === 'group' && !this.name) {
    this.name = 'New Group Chat';
  }
  if (this.type === 'qa' && !this.name) {
    this.name = 'QA Tickets';
  }
  if (this.type === 'workspace' && !this.name && this.workspace) {
    this.name = 'Workspace Discussion';
  }
  next();
});

const ChatChannel = mongoose.model('ChatChannel', chatChannelSchema);

module.exports = ChatChannel;
