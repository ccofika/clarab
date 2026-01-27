const mongoose = require('mongoose');

const kbAdminSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  role: {
    type: String,
    enum: ['superadmin', 'admin'],
    default: 'admin'
  },
  addedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Index for quick lookups
kbAdminSchema.index({ user: 1 });
kbAdminSchema.index({ role: 1 });

// Static method to check if user is an admin
kbAdminSchema.statics.isAdmin = async function(userId) {
  const admin = await this.findOne({ user: userId });
  return !!admin;
};

// Static method to check if user is superadmin
kbAdminSchema.statics.isSuperAdmin = async function(userId) {
  const admin = await this.findOne({ user: userId, role: 'superadmin' });
  return !!admin;
};

// Static method to get admin role
kbAdminSchema.statics.getRole = async function(userId) {
  const admin = await this.findOne({ user: userId });
  return admin ? admin.role : null;
};

module.exports = mongoose.model('KBAdmin', kbAdminSchema);
