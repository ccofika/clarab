const mongoose = require('mongoose');

/**
 * Category Schema for hierarchical procedure categorization
 * Supports unlimited depth levels: Category > Subcategory > Sub-subcategory > ...
 * Used by WorkspaceNavigation to organize and navigate procedures/posts
 */
const categorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Category name is required'],
    trim: true,
    maxlength: [100, 'Category name cannot exceed 100 characters']
  },
  // Parent category reference (null for root categories)
  parent: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    default: null
  },
  // Full path of parent IDs for efficient querying (e.g., [grandparent, parent])
  ancestors: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category'
  }],
  // Depth level in hierarchy (0 = root, 1 = first level subcategory, etc.)
  depth: {
    type: Number,
    default: 0,
    min: 0
  },
  // Icon identifier for visual representation (Lucide icon names)
  icon: {
    type: String,
    default: 'folder',
    trim: true
  },
  // Custom color for category visualization (hex color code)
  color: {
    type: String,
    default: '#6366f1', // Indigo default
    validate: {
      validator: function(v) {
        return /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(v);
      },
      message: 'Invalid hex color code'
    }
  },
  // Description for category context
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  // Order within siblings for custom sorting
  order: {
    type: Number,
    default: 0
  },
  // Soft delete flag
  isDeleted: {
    type: Boolean,
    default: false
  },
  // Statistics
  postCount: {
    type: Number,
    default: 0
  },
  // Metadata
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  lastModifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Indexes for performance
categorySchema.index({ parent: 1 });
categorySchema.index({ ancestors: 1 });
categorySchema.index({ depth: 1 });
categorySchema.index({ name: 1, parent: 1 }, { unique: true }); // Unique name per parent
categorySchema.index({ order: 1 });
categorySchema.index({ isDeleted: 1 });

// Virtual for child categories
categorySchema.virtual('children', {
  ref: 'Category',
  localField: '_id',
  foreignField: 'parent',
  match: { isDeleted: false }
});

// Virtual for posts in this category
categorySchema.virtual('posts', {
  ref: 'CanvasElement',
  localField: '_id',
  foreignField: 'category'
});

// Pre-save middleware to calculate ancestors and depth
categorySchema.pre('save', async function(next) {
  if (this.isModified('parent')) {
    if (this.parent) {
      const parentCategory = await this.constructor.findById(this.parent);
      if (!parentCategory) {
        return next(new Error('Parent category not found'));
      }
      // Build ancestors array from parent's ancestors + parent
      this.ancestors = [...parentCategory.ancestors, parentCategory._id];
      this.depth = parentCategory.depth + 1;
    } else {
      // Root category
      this.ancestors = [];
      this.depth = 0;
    }
  }
  next();
});

// Instance method: Get full path as array of category names
categorySchema.methods.getFullPath = async function() {
  const Category = this.constructor;
  const path = [];

  // Get all ancestor categories
  if (this.ancestors.length > 0) {
    const ancestorCategories = await Category.find({
      _id: { $in: this.ancestors }
    }).sort('depth');

    for (const ancestor of ancestorCategories) {
      path.push(ancestor.name);
    }
  }

  path.push(this.name);
  return path;
};

// Instance method: Check if this category is an ancestor of another
categorySchema.methods.isAncestorOf = function(categoryId) {
  return this.ancestors.some(a => a.equals(categoryId));
};

// Static method: Get category tree starting from root
categorySchema.statics.getTree = async function(options = {}) {
  const { includeDeleted = false, maxDepth = null } = options;

  const match = includeDeleted ? {} : { isDeleted: false };
  if (maxDepth !== null) {
    match.depth = { $lte: maxDepth };
  }

  const categories = await this.find(match).sort({ depth: 1, order: 1, name: 1 });

  // Build tree structure
  const categoryMap = new Map();
  const rootCategories = [];

  categories.forEach(cat => {
    const catObj = cat.toObject();
    catObj.children = [];
    categoryMap.set(cat._id.toString(), catObj);
  });

  categories.forEach(cat => {
    const catObj = categoryMap.get(cat._id.toString());
    if (cat.parent) {
      const parent = categoryMap.get(cat.parent.toString());
      if (parent) {
        parent.children.push(catObj);
      }
    } else {
      rootCategories.push(catObj);
    }
  });

  return rootCategories;
};

// Static method: Get all descendants of a category
categorySchema.statics.getDescendants = async function(categoryId, options = {}) {
  const { includeDeleted = false } = options;

  const match = {
    ancestors: categoryId,
    ...(includeDeleted ? {} : { isDeleted: false })
  };

  return this.find(match).sort({ depth: 1, order: 1, name: 1 });
};

// Static method: Move category to new parent
categorySchema.statics.moveCategory = async function(categoryId, newParentId) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const category = await this.findById(categoryId).session(session);
    if (!category) {
      throw new Error('Category not found');
    }

    // Check for circular reference
    if (newParentId) {
      const newParent = await this.findById(newParentId).session(session);
      if (!newParent) {
        throw new Error('New parent category not found');
      }

      // Check if new parent is a descendant of the category being moved
      if (newParent.ancestors.some(a => a.equals(categoryId))) {
        throw new Error('Cannot move category to its own descendant');
      }
    }

    const oldAncestors = [...category.ancestors];
    const oldDepth = category.depth;

    // Update the category itself
    category.parent = newParentId || null;
    await category.save({ session });

    // Update all descendants
    const depthDiff = category.depth - oldDepth;
    const descendants = await this.find({ ancestors: categoryId }).session(session);

    for (const descendant of descendants) {
      // Replace the old ancestor path with the new one
      const relativeAncestors = descendant.ancestors.slice(
        descendant.ancestors.findIndex(a => a.equals(categoryId))
      );
      descendant.ancestors = [...category.ancestors, ...relativeAncestors];
      descendant.depth += depthDiff;
      await descendant.save({ session });
    }

    await session.commitTransaction();
    return category;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

// Static method: Update post counts for a category and its ancestors
categorySchema.statics.updatePostCounts = async function(categoryId) {
  const category = await this.findById(categoryId);
  if (!category) return;

  const CanvasElement = mongoose.model('CanvasElement');

  // Update this category's post count
  const count = await CanvasElement.countDocuments({
    category: categoryId,
    type: 'wrapper'
  });
  category.postCount = count;
  await category.save();

  // Update ancestor post counts (they include descendant posts)
  for (const ancestorId of category.ancestors) {
    const ancestor = await this.findById(ancestorId);
    if (ancestor) {
      const descendants = await this.find({ ancestors: ancestorId });
      const descendantIds = [ancestorId, ...descendants.map(d => d._id)];

      const totalCount = await CanvasElement.countDocuments({
        category: { $in: descendantIds },
        type: 'wrapper'
      });

      ancestor.postCount = totalCount;
      await ancestor.save();
    }
  }
};

module.exports = mongoose.model('Category', categorySchema);
