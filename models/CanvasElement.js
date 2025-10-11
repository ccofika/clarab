const mongoose = require('mongoose');

const canvasElementSchema = new mongoose.Schema({
  canvas: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Canvas',
    required: true
  },
  type: {
    type: String,
    enum: ['text', 'subtext', 'card', 'image', 'link', 'sticky-note', 'title', 'description', 'macro', 'example'],
    required: true
  },
  position: {
    x: {
      type: Number,
      required: true,
      default: 0
    },
    y: {
      type: Number,
      required: true,
      default: 0
    },
    z: {
      // Z-index for layering
      type: Number,
      default: 0
    }
  },
  dimensions: {
    width: {
      type: Number,
      default: 200
    },
    height: {
      type: Number,
      default: 100
    }
  },
  content: {
    // Content varies by type
    text: String,
    html: String,
    url: String,
    imageUrl: String,
    // For expandable cards
    title: String,
    description: String,
    isExpanded: {
      type: Boolean,
      default: false
    },
    color: {
      type: String,
      default: '#ffffff'
    },
    // Inline images metadata (for tracking uploaded images for cleanup)
    inlineImages: [{
      id: String, // Unique identifier for the image in the content
      url: String, // Cloudinary secure URL
      publicId: String, // Cloudinary public ID for deletion
      width: Number,
      height: Number,
      format: String,
      bytes: Number,
      uploadedAt: {
        type: Date,
        default: Date.now
      }
    }],
    // For title/description/macro/example elements
    value: String,
    // Text formatting for value
    valueFormatting: {
      bold: { type: Boolean, default: false },
      italic: { type: Boolean, default: false },
      underline: { type: Boolean, default: false },
      hyperlink: String,
      elementLink: {
        elementId: String,
        workspaceId: String
      }
    },
    // History for undo/redo (stores last 3 changes)
    history: [{
      value: String,
      formatting: {
        bold: Boolean,
        italic: Boolean,
        underline: Boolean,
        hyperlink: String,
        elementLink: {
          elementId: String,
          workspaceId: String
        }
      },
      timestamp: {
        type: Date,
        default: Date.now
      }
    }],
    // Text formatting for title (in macro/example elements)
    titleFormatting: {
      bold: { type: Boolean, default: false },
      italic: { type: Boolean, default: false },
      underline: { type: Boolean, default: false },
      hyperlink: String,
      elementLink: {
        elementId: String,
        workspaceId: String
      }
    },
    // Text formatting for description (in macro elements)
    descriptionFormatting: {
      bold: { type: Boolean, default: false },
      italic: { type: Boolean, default: false },
      underline: { type: Boolean, default: false },
      hyperlink: String,
      elementLink: {
        elementId: String,
        workspaceId: String
      }
    },
    // For macro elements - separate histories for title and description
    titleHistory: [{
      value: String,
      formatting: {
        bold: Boolean,
        italic: Boolean,
        underline: Boolean,
        hyperlink: String,
        elementLink: {
          elementId: String,
          workspaceId: String
        }
      },
      timestamp: {
        type: Date,
        default: Date.now
      }
    }],
    descriptionHistory: [{
      value: String,
      formatting: {
        bold: Boolean,
        italic: Boolean,
        underline: Boolean,
        hyperlink: String,
        elementLink: {
          elementId: String,
          workspaceId: String
        }
      },
      timestamp: {
        type: Date,
        default: Date.now
      }
    }],
    // For example elements - conversation messages
    messages: [{
      type: {
        type: String,
        enum: ['user', 'agent'],
        required: true
      },
      text: {
        type: String,
        required: true
      },
      formatting: {
        bold: { type: Boolean, default: false },
        italic: { type: Boolean, default: false },
        underline: { type: Boolean, default: false },
        hyperlink: String,
        elementLink: {
          elementId: String,
          workspaceId: String
        }
      },
      timestamp: {
        type: Date,
        default: Date.now
      }
    }],
    // Current example index for navigation
    currentExampleIndex: {
      type: Number,
      default: 0
    },
    // Array of all examples
    examples: [{
      title: String,
      titleFormatting: {
        bold: { type: Boolean, default: false },
        italic: { type: Boolean, default: false },
        underline: { type: Boolean, default: false },
        hyperlink: String
      },
      messages: [{
        type: {
          type: String,
          enum: ['user', 'agent']
        },
        text: String,
        formatting: {
          bold: { type: Boolean, default: false },
          italic: { type: Boolean, default: false },
          underline: { type: Boolean, default: false },
          hyperlink: String
        },
        timestamp: {
          type: Date,
          default: Date.now
        }
      }],
      titleHistory: [{
        value: String,
        formatting: {
          bold: Boolean,
          italic: Boolean,
          underline: Boolean,
          hyperlink: String
        },
        timestamp: {
          type: Date,
          default: Date.now
        }
      }]
    }]
  },
  style: {
    backgroundColor: String,
    borderColor: String,
    borderWidth: {
      type: Number,
      default: 1
    },
    borderRadius: {
      type: Number,
      default: 4
    },
    fontSize: {
      type: Number,
      default: 14
    },
    fontWeight: {
      type: String,
      default: 'normal'
    },
    fontFamily: {
      type: String,
      default: 'system-ui'
    },
    textColor: {
      type: String,
      default: '#000000'
    },
    textAlign: {
      type: String,
      enum: ['left', 'center', 'right', 'justify'],
      default: 'left'
    },
    lineHeight: {
      type: Number,
      default: 1.5
    },
    letterSpacing: {
      type: Number,
      default: 0
    },
    padding: {
      type: Number,
      default: 12
    },
    opacity: {
      type: Number,
      default: 1,
      min: 0,
      max: 1
    },
    // Shadow settings
    shadowColor: {
      type: String,
      default: 'rgba(0, 0, 0, 0.1)'
    },
    shadowBlur: {
      type: Number,
      default: 0
    },
    shadowOffsetX: {
      type: Number,
      default: 0
    },
    shadowOffsetY: {
      type: Number,
      default: 0
    },
    // For macro and example elements - separate title styling
    titleFontSize: {
      type: Number,
      default: 18
    },
    titleFontWeight: {
      type: String,
      default: 'semibold'
    },
    titleColor: {
      type: String,
      default: '#000000'
    },
    // For macro and example elements - separate description/content styling
    descriptionFontSize: {
      type: Number,
      default: 14
    },
    descriptionColor: {
      type: String,
      default: '#000000'
    },
    // For example elements - message styling
    userMessageColor: {
      type: String,
      default: '#6b7280'
    },
    agentMessageColor: {
      type: String,
      default: '#3b82f6'
    },
    messageFontSize: {
      type: Number,
      default: 14
    }
  },
  locked: {
    type: Boolean,
    default: false // Locked elements can't be moved/edited
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  lastEditedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Indexes for performance
canvasElementSchema.index({ canvas: 1 });
canvasElementSchema.index({ canvas: 1, 'position.z': 1 });
canvasElementSchema.index({ type: 1 });

// Text search indexes for search functionality
canvasElementSchema.index({ 'content.value': 'text' });
canvasElementSchema.index({ 'content.title': 'text' });
canvasElementSchema.index({ 'content.description': 'text' });
canvasElementSchema.index({ 'content.text': 'text' });
canvasElementSchema.index({ 'content.examples.title': 'text' });

// Update canvas element count after save/delete
canvasElementSchema.post('save', async function() {
  const Canvas = mongoose.model('Canvas');
  const canvas = await Canvas.findById(this.canvas);
  if (canvas) {
    await canvas.updateElementCount();
  }
});

canvasElementSchema.post('remove', async function() {
  const Canvas = mongoose.model('Canvas');
  const canvas = await Canvas.findById(this.canvas);
  if (canvas) {
    await canvas.updateElementCount();
  }
});

// Clean up Cloudinary images when element is deleted
canvasElementSchema.pre('findOneAndDelete', async function() {
  try {
    const doc = await this.model.findOne(this.getFilter());
    if (doc && doc.content && doc.content.inlineImages && doc.content.inlineImages.length > 0) {
      const cloudinary = require('../config/cloudinary');

      // Delete all inline images from Cloudinary
      for (const image of doc.content.inlineImages) {
        if (image.publicId) {
          try {
            await cloudinary.uploader.destroy(image.publicId);
            console.log(`Deleted image from Cloudinary: ${image.publicId}`);
          } catch (error) {
            console.error(`Failed to delete image ${image.publicId} from Cloudinary:`, error);
          }
        }
      }
    }
  } catch (error) {
    console.error('Error in cleanup hook:', error);
  }
});

module.exports = mongoose.model('CanvasElement', canvasElementSchema);
