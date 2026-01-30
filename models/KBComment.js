const mongoose = require('mongoose');

const KBCommentSchema = new mongoose.Schema({
  page: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'KBPage',
    required: true,
    index: true
  },
  blockId: {
    type: String,
    default: null
  },
  parentComment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'KBComment',
    default: null
  },
  content: {
    type: String,
    required: true,
    trim: true,
    maxlength: 5000
  },
  mentions: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  isResolved: {
    type: Boolean,
    default: false
  },
  resolvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  resolvedAt: Date,
  reactions: [{
    emoji: { type: String, required: true },
    users: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
  }],
  isDeleted: {
    type: Boolean,
    default: false
  }
}, { timestamps: true });

KBCommentSchema.index({ page: 1, createdAt: -1 });
KBCommentSchema.index({ page: 1, blockId: 1 });
KBCommentSchema.index({ parentComment: 1 });

// Static: get comments for a page
KBCommentSchema.statics.getPageComments = async function(pageId) {
  const comments = await this.find({
    page: pageId,
    isDeleted: false,
    parentComment: null
  })
    .sort({ createdAt: -1 })
    .populate('author', 'name email')
    .populate('resolvedBy', 'name email')
    .populate('mentions', 'name email')
    .lean();

  // Fetch replies for each comment
  for (let comment of comments) {
    comment.replies = await this.find({
      parentComment: comment._id,
      isDeleted: false
    })
      .sort({ createdAt: 1 })
      .populate('author', 'name email')
      .populate('mentions', 'name email')
      .lean();
  }

  return comments;
};

// Static: count unresolved comments for a page
KBCommentSchema.statics.getUnresolvedCount = async function(pageId) {
  return this.countDocuments({
    page: pageId,
    isDeleted: false,
    parentComment: null,
    isResolved: false
  });
};

module.exports = mongoose.model('KBComment', KBCommentSchema);
