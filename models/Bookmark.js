const mongoose = require('mongoose');

const bookmarkSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  element: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CanvasElement',
    required: true
  },
  workspace: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Workspace',
    required: true
  },
  customName: {
    type: String,
    trim: true,
    default: function() {
      return 'Untitled Bookmark';
    }
  }
}, {
  timestamps: true
});

// Index for faster queries
bookmarkSchema.index({ user: 1, createdAt: -1 });
bookmarkSchema.index({ user: 1, element: 1 }, { unique: true }); // Prevent duplicate bookmarks

module.exports = mongoose.model('Bookmark', bookmarkSchema);
