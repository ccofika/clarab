const mongoose = require('mongoose');

/**
 * QA Knowledge Base Category Schema
 * Used by AI to understand and evaluate tickets
 */

const imageSchema = new mongoose.Schema({
  url: {
    type: String,
    required: true
  },
  publicId: {
    type: String
  },
  filename: {
    type: String
  },
  width: Number,
  height: Number,
  format: String,
  bytes: Number
}, { _id: true });

const subcategorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    default: ''
  },
  knowledge: {
    type: String,
    default: ''
  },
  images: [imageSchema],
  examples: [{
    type: String
  }],
  keywords: [{
    type: String
  }],
  evaluationCriteria: {
    type: String,
    default: ''
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, { _id: true });

const qaCategorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  description: {
    type: String,
    default: ''
  },
  knowledge: {
    type: String,
    default: ''
  },
  images: [imageSchema],
  subcategories: [subcategorySchema],
  keywords: [{
    type: String
  }],
  evaluationCriteria: {
    type: String,
    default: ''
  },
  // Basic Knowledge category is always sent to AI
  isBasicKnowledge: {
    type: Boolean,
    default: false
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Index for search
qaCategorySchema.index({ name: 'text', 'subcategories.name': 'text' });

// Static method to get all categories with subcategories
qaCategorySchema.statics.getAllActive = function() {
  return this.find({ isActive: true })
    .select('name description knowledge images subcategories keywords evaluationCriteria isBasicKnowledge')
    .sort({ isBasicKnowledge: -1, name: 1 });
};

// Static method to get knowledge for AI prompt
qaCategorySchema.statics.getKnowledgeForAI = async function() {
  const categories = await this.find({ isActive: true })
    .select('name description knowledge images subcategories keywords evaluationCriteria isBasicKnowledge')
    .sort({ isBasicKnowledge: -1, name: 1 });

  return categories.map(cat => ({
    category: cat.name,
    description: cat.description,
    knowledge: cat.knowledge,
    keywords: cat.keywords,
    evaluationCriteria: cat.evaluationCriteria,
    isBasicKnowledge: cat.isBasicKnowledge,
    images: cat.images?.map(img => ({
      url: img.url,
      filename: img.filename
    })) || [],
    subcategories: cat.subcategories
      .filter(sub => sub.isActive)
      .map(sub => ({
        name: sub.name,
        description: sub.description,
        knowledge: sub.knowledge,
        keywords: sub.keywords,
        examples: sub.examples,
        evaluationCriteria: sub.evaluationCriteria,
        images: sub.images?.map(img => ({
          url: img.url,
          filename: img.filename
        })) || []
      }))
  }));
};

// Static method to get specific category knowledge
qaCategorySchema.statics.getCategoryKnowledge = async function(categoryName) {
  const category = await this.findOne({
    name: { $regex: new RegExp(`^${categoryName}$`, 'i') },
    isActive: true
  });

  if (!category) return null;

  return {
    category: category.name,
    description: category.description,
    knowledge: category.knowledge,
    evaluationCriteria: category.evaluationCriteria,
    isBasicKnowledge: category.isBasicKnowledge,
    images: category.images?.map(img => ({
      url: img.url,
      filename: img.filename
    })) || [],
    subcategories: category.subcategories
      .filter(sub => sub.isActive)
      .map(sub => ({
        name: sub.name,
        description: sub.description,
        knowledge: sub.knowledge,
        evaluationCriteria: sub.evaluationCriteria,
        images: sub.images?.map(img => ({
          url: img.url,
          filename: img.filename
        })) || []
      }))
  };
};

// Static method to get or create Basic Knowledge category
qaCategorySchema.statics.ensureBasicKnowledge = async function() {
  let basicKnowledge = await this.findOne({ isBasicKnowledge: true });

  if (!basicKnowledge) {
    basicKnowledge = await this.create({
      name: 'Basic Knowledge',
      description: 'Osnovni knowledge koji se uvek šalje AI-u prilikom evaluacije tiketa.',
      knowledge: '',
      isBasicKnowledge: true,
      isActive: true,
      keywords: [],
      subcategories: []
    });
  }

  return basicKnowledge;
};

module.exports = mongoose.model('QACategory', qaCategorySchema);
