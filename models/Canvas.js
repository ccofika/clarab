const mongoose = require('mongoose');

const canvasSchema = new mongoose.Schema({
  workspace: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Workspace',
    required: true,
    unique: true // Each workspace has exactly one canvas
  },
  viewState: {
    // Pan/zoom state for the canvas
    scale: {
      type: Number,
      default: 1,
      min: 0.1,
      max: 5
    },
    offsetX: {
      type: Number,
      default: 0
    },
    offsetY: {
      type: Number,
      default: 0
    }
  },
  dimensions: {
    // Virtual canvas dimensions (infinite canvas concept)
    width: {
      type: Number,
      default: 5000
    },
    height: {
      type: Number,
      default: 5000
    }
  },
  metadata: {
    lastEditedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    elementCount: {
      type: Number,
      default: 0
    }
  }
}, {
  timestamps: true
});

// Index for workspace lookup
canvasSchema.index({ workspace: 1 });

// Virtual for elements
canvasSchema.virtual('elements', {
  ref: 'CanvasElement',
  localField: '_id',
  foreignField: 'canvas'
});

// Update elementCount when elements change
canvasSchema.methods.updateElementCount = async function() {
  const CanvasElement = mongoose.model('CanvasElement');
  this.metadata.elementCount = await CanvasElement.countDocuments({ canvas: this._id });
  await this.save();
};

module.exports = mongoose.model('Canvas', canvasSchema);
