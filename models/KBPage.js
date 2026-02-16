const mongoose = require('mongoose');

const dropdownOptionSchema = new mongoose.Schema({
  value: { type: String, required: true },
  label: { type: String, required: true },
  icon: { type: String }
}, { _id: false });

const dropdownSchema = new mongoose.Schema({
  id: { type: String, required: true },
  label: { type: String, required: true },
  icon: { type: String },
  options: [dropdownOptionSchema],
  defaultValue: { type: String }
}, { _id: false });

const blockSchema = new mongoose.Schema({
  id: { type: String, required: true },
  type: {
    type: String,
    enum: [
      'paragraph',
      'heading_1',
      'heading_2',
      'heading_3',
      'bulleted_list',
      'numbered_list',
      'toggle',
      'callout',
      'quote',
      'divider',
      'code',
      'image',
      'table',
      // New block types
      'video',
      'embed',
      'bookmark',
      'file',
      'equation',
      'button',
      'table_of_contents',
      'audio',
      'pdf',
      'breadcrumbs',
      'synced_block',
      'columns',
      'collapsible_heading',
      'expandable_content_list'
    ],
    required: true
  },
  defaultContent: { type: mongoose.Schema.Types.Mixed },
  // Variants map: "dropdownId:optionValue" -> content
  variants: {
    type: Map,
    of: mongoose.Schema.Types.Mixed,
    default: new Map()
  },
  // Additional properties (styling, callout type, code language, etc.)
  properties: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, { _id: false });

const kbPageSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  slug: {
    type: String,
    unique: true,
    required: true,
    trim: true,
    lowercase: true
  },
  icon: {
    type: String,
    default: '📄'
  },
  coverImage: {
    type: String
  },

  // Hierarchy
  parentPage: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'KBPage',
    default: null
  },
  order: {
    type: Number,
    default: 0
  },

  // Per-page dropdown menus
  dropdowns: [dropdownSchema],

  // Page content blocks
  blocks: [blockSchema],

  // Metadata
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  lastModifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },

  // Soft delete
  isDeleted: {
    type: Boolean,
    default: false
  },
  deletedAt: {
    type: Date
  },
  deletedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },

  // Publishing
  isPublished: {
    type: Boolean,
    default: true
  },

  // Is this a section (folder) for grouping pages
  isSection: {
    type: Boolean,
    default: false
  },

  // Section ID for grouping (references KBSection._id)
  sectionId: {
    type: String,
    default: null
  },

  // Page display settings (fullWidth, theme, etc.)
  pageSettings: {
    type: mongoose.Schema.Types.Mixed,
    default: { fullWidth: false, theme: '' }
  },

  // Tags
  tags: [{
    type: String,
    lowercase: true,
    trim: true
  }],

  // Permissions
  permissions: {
    visibility: {
      type: String,
      enum: ['private', 'workspace', 'public'],
      default: 'workspace'
    },
    inheritFromParent: {
      type: Boolean,
      default: true
    },
    users: [{
      user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      role: { type: String, enum: ['viewer', 'commenter', 'editor', 'admin'] }
    }],
    shareLink: {
      enabled: { type: Boolean, default: false },
      token: String,
      expiresAt: Date,
      allowComments: { type: Boolean, default: false },
      allowDuplication: { type: Boolean, default: false }
    }
  }
}, {
  timestamps: true
});

// Indexes for performance
kbPageSchema.index({ slug: 1 });
kbPageSchema.index({ parentPage: 1, order: 1 });
kbPageSchema.index({ isDeleted: 1, isPublished: 1 });
kbPageSchema.index({ createdBy: 1 });

// Text search index
kbPageSchema.index({ title: 'text' });
kbPageSchema.index({ tags: 1 });
kbPageSchema.index({ 'permissions.visibility': 1 });

// Generate slug from title if not provided
kbPageSchema.pre('validate', function(next) {
  if (!this.slug && this.title) {
    this.slug = this.title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
  }
  next();
});

// Static method to build page tree
kbPageSchema.statics.getTree = async function(includeUnpublished = false) {
  const query = { isDeleted: false };
  if (!includeUnpublished) {
    query.isPublished = true;
  }

  const pages = await this.find(query)
    .select('title slug icon parentPage order isSection sectionId tags')
    .sort({ order: 1 })
    .lean();

  const buildTree = (parentId = null) => {
    return pages
      .filter(p => String(p.parentPage || null) === String(parentId))
      .map(page => ({
        ...page,
        children: buildTree(page._id)
      }));
  };

  return buildTree(null);
};

// Instance method to get breadcrumb path
kbPageSchema.methods.getBreadcrumbs = async function() {
  const breadcrumbs = [{ title: this.title, slug: this.slug }];
  let currentPage = this;

  while (currentPage.parentPage) {
    currentPage = await this.constructor.findById(currentPage.parentPage)
      .select('title slug parentPage');
    if (currentPage) {
      breadcrumbs.unshift({ title: currentPage.title, slug: currentPage.slug });
    } else {
      break;
    }
  }

  return breadcrumbs;
};

module.exports = mongoose.model('KBPage', kbPageSchema);
