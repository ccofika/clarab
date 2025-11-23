const mongoose = require('mongoose');

const channelSectionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 50
  },
  emoji: {
    type: String,
    maxlength: 10,
    default: null
  },
  channels: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ChatChannel'
  }],
  order: {
    type: Number,
    required: true,
    default: 0
  },
  isCollapsed: {
    type: Boolean,
    default: false
  },
  color: {
    type: String,
    default: null // Optional color for section header
  }
}, {
  timestamps: true
});

// Compound index for efficient user queries
channelSectionSchema.index({ userId: 1, order: 1 });

// Instance methods
channelSectionSchema.methods.addChannel = function(channelId) {
  if (!this.channels.includes(channelId)) {
    this.channels.push(channelId);
    return this.save();
  }
  return Promise.resolve(this);
};

channelSectionSchema.methods.removeChannel = function(channelId) {
  this.channels = this.channels.filter(
    id => id.toString() !== channelId.toString()
  );
  return this.save();
};

channelSectionSchema.methods.toggleCollapse = function() {
  this.isCollapsed = !this.isCollapsed;
  return this.save();
};

// Static methods
channelSectionSchema.statics.getUserSections = async function(userId) {
  return this.find({ userId })
    .populate({
      path: 'channels',
      populate: [
        { path: 'members.userId', select: 'name email avatar' },
        { path: 'lastMessage.sender', select: 'name avatar' }
      ]
    })
    .sort({ order: 1 });
};

channelSectionSchema.statics.reorderSections = async function(userId, sectionOrders) {
  // sectionOrders is an array of { sectionId, order }
  const updates = sectionOrders.map(({ sectionId, order }) =>
    this.findOneAndUpdate(
      { _id: sectionId, userId },
      { order },
      { new: true }
    )
  );

  return Promise.all(updates);
};

module.exports = mongoose.model('ChannelSection', channelSectionSchema);
