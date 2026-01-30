const mongoose = require('mongoose');

const KBSettingsSchema = new mongoose.Schema({
  // Singleton pattern - only one settings doc
  key: {
    type: String,
    default: 'global',
    unique: true
  },

  // Default permissions for new pages
  defaultPermissions: {
    visibility: {
      type: String,
      enum: ['private', 'workspace', 'public'],
      default: 'workspace'
    }
  },

  // Allowed block types (empty = all allowed)
  allowedBlockTypes: [{
    type: String,
    trim: true
  }],

  // KB branding
  branding: {
    name: {
      type: String,
      default: 'Knowledge Base',
      maxlength: 100
    },
    description: {
      type: String,
      default: '',
      maxlength: 500
    }
  },

  // Content settings
  contentSettings: {
    maxPageDepth: {
      type: Number,
      default: 5,
      min: 1,
      max: 10
    },
    versionRetentionCount: {
      type: Number,
      default: 100,
      min: 10,
      max: 500
    },
    allowPublicSharing: {
      type: Boolean,
      default: true
    },
    allowComments: {
      type: Boolean,
      default: true
    }
  },

  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, { timestamps: true });

// Static: get or create settings
KBSettingsSchema.statics.getSettings = async function() {
  let settings = await this.findOne({ key: 'global' });
  if (!settings) {
    settings = await this.create({ key: 'global' });
  }
  return settings;
};

module.exports = mongoose.model('KBSettings', KBSettingsSchema);
