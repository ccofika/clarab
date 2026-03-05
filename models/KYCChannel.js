const mongoose = require('mongoose');

const kycChannelSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  slackChannelId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  organization: {
    type: String,
    required: true,
    trim: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  // Whether the Slack bot has been added to this channel (can receive events)
  botInstalled: {
    type: Boolean,
    default: false
  },
  // "full" = ⏳/✅ lifecycle for ALL messages
  // "message_count" = each agent message = 1 case (no reactions)
  // "hybrid" = agent message = instant case, non-agent message = full ⏳/✅ lifecycle
  trackingMode: {
    type: String,
    enum: ['full', 'message_count', 'hybrid'],
    default: 'full'
  },
  trackingConfig: {
    ticketDetection: {
      type: String,
      enum: ['new_message'],
      default: 'new_message'
    },
    claimDetection: {
      emojis: {
        type: [String],
        default: ['hourglass_flowing_sand', 'hourglass', 'timer_clock']
      }
    },
    resolveDetection: {
      emojis: {
        type: [String],
        default: ['white_check_mark', 'heavy_check_mark', 'x', 'negative_squared_cross_mark']
      },
      threadReplyFallback: {
        type: Boolean,
        default: true
      }
    }
  }
}, {
  timestamps: true
});

// Static: find by Slack channel ID
kycChannelSchema.statics.findBySlackId = function(slackChannelId) {
  return this.findOne({ slackChannelId, isActive: true });
};

// Static: get all active channel IDs
kycChannelSchema.statics.getActiveChannelIds = async function() {
  const channels = await this.find({ isActive: true }).select('slackChannelId');
  return channels.map(c => c.slackChannelId);
};

const KYCChannel = mongoose.model('KYCChannel', kycChannelSchema);

module.exports = KYCChannel;
