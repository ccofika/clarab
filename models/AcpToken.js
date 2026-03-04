const mongoose = require('mongoose');

const acpTokenSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  encryptedToken: { type: String, required: true },
  iv: { type: String, required: true },
  authTag: { type: String, required: true },
  expiresAt: { type: Date, required: true }
}, { timestamps: true });

// TTL index — auto-delete expired tokens
acpTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('AcpToken', acpTokenSchema);
