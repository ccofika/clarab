const mongoose = require('mongoose');

const scrapedConversationSchema = new mongoose.Schema({
  session: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ScrapeSession',
    required: true,
    index: true
  },
  conversationId: {
    type: String,
    required: true,
    index: true
  },
  agent: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Agent',
    required: true,
    index: true
  },
  exportedText: {
    type: String,
    default: ''
  },
  images: [{
    url: {
      type: String,
      required: true
    },
    filename: {
      type: String
    },
    alt: {
      type: String
    }
  }],
  combinedText: {
    type: String,
    default: ''
  },
  messageCount: {
    type: Number,
    default: 0
  },
  // Parsed messages for chat display
  messages: [{
    role: {
      type: String,
      enum: ['customer', 'agent', 'system', 'bot'],
      default: 'customer'
    },
    sender: {
      type: String
    },
    content: {
      type: String
    },
    timestamp: {
      type: Date
    },
    hasImage: {
      type: Boolean,
      default: false
    },
    imageUrls: [{
      type: String
    }]
  }],
  // Metadata
  customerName: {
    type: String
  },
  agentName: {
    type: String
  },
  conversationStarted: {
    type: Date
  },
  conversationEnded: {
    type: Date
  },
  scrapedAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  scrapeError: {
    type: String
  },
  status: {
    type: String,
    enum: ['success', 'failed', 'partial'],
    default: 'success'
  }
}, {
  timestamps: true
});

// Compound indexes
scrapedConversationSchema.index({ session: 1, conversationId: 1 }, { unique: true });
scrapedConversationSchema.index({ session: 1, scrapedAt: -1 });
scrapedConversationSchema.index({ agent: 1, scrapedAt: -1 });

// Static method to get conversations by session
scrapedConversationSchema.statics.getBySession = function(sessionId, options = {}) {
  const { page = 1, limit = 50 } = options;

  return this.find({ session: sessionId })
    .select('-exportedText -combinedText') // Exclude large text fields for list view
    .sort({ scrapedAt: 1 })
    .skip((page - 1) * limit)
    .limit(limit);
};

// Static method to get full conversation with all fields
scrapedConversationSchema.statics.getFullConversation = function(conversationId) {
  return this.findById(conversationId)
    .populate('agent', 'name team')
    .populate('session', 'csvFileName createdAt');
};

// Instance method to parse exported text into messages
scrapedConversationSchema.methods.parseExportedText = function() {
  if (!this.exportedText) return [];

  const messages = [];
  const lines = this.exportedText.split('\n');
  let currentMessage = null;

  for (const line of lines) {
    // Pattern: "Name (timestamp)" or similar
    const headerMatch = line.match(/^(.+?)\s*\(([^)]+)\)\s*$/);

    if (headerMatch) {
      // Save previous message if exists
      if (currentMessage && currentMessage.content.trim()) {
        messages.push(currentMessage);
      }

      // Start new message
      const sender = headerMatch[1].trim();
      const isAgent = sender.toLowerCase() !== 'customer' &&
                      !sender.toLowerCase().includes('user') &&
                      !sender.toLowerCase().includes('visitor');

      // Parse timestamp safely
      let parsedTimestamp = null;
      try {
        const dateAttempt = new Date(headerMatch[2]);
        if (!isNaN(dateAttempt.getTime())) {
          parsedTimestamp = dateAttempt;
        }
      } catch (e) {
        // Invalid date, leave as null
      }

      currentMessage = {
        role: isAgent ? 'agent' : 'customer',
        sender: sender,
        content: '',
        timestamp: parsedTimestamp,
        hasImage: false,
        imageUrls: []
      };
    } else if (currentMessage) {
      // Check for image references
      const imageMatch = line.match(/\[Image[:\s]+"?([^"\]]+)"?\]/i);
      if (imageMatch) {
        currentMessage.hasImage = true;
        // Try to find matching image URL
        const matchingImage = this.images.find(img =>
          img.url.includes(imageMatch[1].split('?')[0])
        );
        if (matchingImage) {
          currentMessage.imageUrls.push(matchingImage.url);
        }
      }

      currentMessage.content += line + '\n';
    }
  }

  // Add last message
  if (currentMessage && currentMessage.content.trim()) {
    messages.push(currentMessage);
  }

  this.messages = messages;
  this.messageCount = messages.length;

  return messages;
};

// Pre-save hook to count messages
scrapedConversationSchema.pre('save', function(next) {
  if (this.messages && this.messages.length > 0) {
    this.messageCount = this.messages.length;
  }
  next();
});

module.exports = mongoose.model('ScrapedConversation', scrapedConversationSchema);
