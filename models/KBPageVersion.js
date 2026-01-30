const mongoose = require('mongoose');

const versionBlockSchema = new mongoose.Schema({
  id: { type: String },
  type: { type: String },
  defaultContent: { type: mongoose.Schema.Types.Mixed },
  variants: {
    type: Map,
    of: mongoose.Schema.Types.Mixed,
    default: new Map()
  },
  properties: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, { _id: false });

const KBPageVersionSchema = new mongoose.Schema({
  page: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'KBPage',
    required: true,
    index: true
  },
  version: {
    type: Number,
    required: true
  },
  title: String,
  icon: String,
  coverImage: String,
  blocks: [versionBlockSchema],
  dropdowns: [{
    id: String,
    label: String,
    icon: String,
    options: [{
      value: String,
      label: String,
      icon: String
    }],
    defaultValue: String
  }],
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  changesSummary: String
}, { timestamps: true });

KBPageVersionSchema.index({ page: 1, version: -1 });
KBPageVersionSchema.index({ page: 1, createdAt: -1 });

// Static: create a version snapshot from a page
KBPageVersionSchema.statics.createVersion = async function(page, userId, summary) {
  const lastVersion = await this.findOne({ page: page._id }).sort({ version: -1 });
  const nextVersion = lastVersion ? lastVersion.version + 1 : 1;

  const version = await this.create({
    page: page._id,
    version: nextVersion,
    title: page.title,
    icon: page.icon,
    coverImage: page.coverImage,
    blocks: page.blocks,
    dropdowns: page.dropdowns,
    createdBy: userId,
    changesSummary: summary || `Version ${nextVersion}`
  });

  // Auto-cleanup: keep only the latest 100 versions per page
  await this.cleanup(page._id, 100);

  return version;
};

// Static: get versions for a page
KBPageVersionSchema.statics.getVersions = async function(pageId, limit = 50) {
  return this.find({ page: pageId })
    .sort({ version: -1 })
    .limit(limit)
    .populate('createdBy', 'name email')
    .lean();
};

// Static: cleanup old versions (keep latest N)
KBPageVersionSchema.statics.cleanup = async function(pageId, keepCount = 100) {
  const versions = await this.find({ page: pageId }).sort({ version: -1 }).skip(keepCount);
  if (versions.length > 0) {
    const idsToDelete = versions.map(v => v._id);
    await this.deleteMany({ _id: { $in: idsToDelete } });
  }
  return versions.length;
};

module.exports = mongoose.model('KBPageVersion', KBPageVersionSchema);
