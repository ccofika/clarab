const mongoose = require('mongoose');

const workspaceSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Workspace name is required'],
    trim: true
  },
  type: {
    type: String,
    enum: ['announcements', 'personal'],
    required: true
  },
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: function() {
      return this.type === 'personal'; // Owner required only for personal workspaces
    }
  },
  members: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  invitedMembers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  isPublic: {
    type: Boolean,
    default: function() {
      return this.type === 'announcements'; // Announcements is public by default
    }
  },
  settings: {
    backgroundColor: {
      type: String,
      default: '#ffffff'
    },
    gridEnabled: {
      type: Boolean,
      default: true
    },
    snapToGrid: {
      type: Boolean,
      default: false
    }
  }
}, {
  timestamps: true
});

// Index for faster queries
workspaceSchema.index({ owner: 1, type: 1 });
workspaceSchema.index({ type: 1 });

// Virtual for canvas
workspaceSchema.virtual('canvas', {
  ref: 'Canvas',
  localField: '_id',
  foreignField: 'workspace',
  justOne: true
});

// Helper function to extract ID from ObjectId or populated object
function extractId(item) {
  if (!item) return null;
  // If it's already a string, return it
  if (typeof item === 'string') return item;
  // If it has _id property (populated object), return _id as string
  if (item._id) return item._id.toString();
  // Otherwise convert to string (ObjectId)
  return item.toString();
}

// Methods for permission checking
workspaceSchema.methods.canEdit = function(userId, userRole) {
  // Admin can edit everything
  if (userRole === 'admin') return true;

  // Announcements can only be edited by admins
  if (this.type === 'announcements') return false;

  // Owner can edit their own workspace
  const ownerId = extractId(this.owner);
  const userIdStr = userId.toString();
  if (ownerId && ownerId === userIdStr) return true;

  return false;
};

workspaceSchema.methods.canDelete = function(userId, userRole) {
  // Admin can delete personal workspaces
  if (userRole === 'admin' && this.type === 'personal') return true;

  // Cannot delete announcements workspace
  if (this.type === 'announcements') return false;

  // Owner can delete their own workspace
  const ownerId = extractId(this.owner);
  const userIdStr = userId.toString();
  if (ownerId && ownerId === userIdStr) return true;

  return false;
};

workspaceSchema.methods.canView = function(userId) {
  const userIdStr = userId.toString();

  // Public workspaces (announcements) can be viewed by everyone
  if (this.isPublic) return true;

  // Owner can view
  const ownerId = extractId(this.owner);
  if (ownerId && ownerId === userIdStr) return true;

  // Members can view
  if (this.members && this.members.some(m => extractId(m) === userIdStr)) return true;

  // Invited members can view
  if (this.invitedMembers && this.invitedMembers.some(m => extractId(m) === userIdStr)) return true;

  return false;
};

workspaceSchema.methods.canEditContent = function(userId, userRole) {
  const userIdStr = userId.toString();

  // Admin can edit content in announcements
  if (this.type === 'announcements' && userRole === 'admin') return true;

  // In announcements, only admin can edit
  if (this.type === 'announcements') return false;

  // Owner can edit content in their workspace
  const ownerId = extractId(this.owner);
  if (ownerId && ownerId === userIdStr) return true;

  // Members can edit content (but not invited members - they have read-only access)
  if (this.members && this.members.some(m => extractId(m) === userIdStr)) return true;

  return false;
};

module.exports = mongoose.model('Workspace', workspaceSchema);
