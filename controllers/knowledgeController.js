const QACategory = require('../models/QACategory');
const FlaggedTicket = require('../models/FlaggedTicket');
const Rule = require('../models/Rule');
const RuleChunk = require('../models/RuleChunk');
const embeddingsService = require('../services/embeddingsService');
const { logActivity } = require('../utils/activityLogger');

/**
 * @desc    Get all categories
 * @route   GET /api/qa/knowledge/categories
 * @access  Private (Admin only)
 */
exports.getCategories = async (req, res) => {
  try {
    // Ensure Basic Knowledge category exists
    await QACategory.ensureBasicKnowledge();

    const categories = await QACategory.find()
      .sort({ isBasicKnowledge: -1, name: 1 });

    res.json(categories);
  } catch (error) {
    console.error('Error getting categories:', error);
    res.status(500).json({ message: 'Failed to get categories' });
  }
};

/**
 * @desc    Get single category
 * @route   GET /api/qa/knowledge/categories/:id
 * @access  Private (Admin only)
 */
exports.getCategory = async (req, res) => {
  try {
    const category = await QACategory.findById(req.params.id);

    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }

    res.json(category);
  } catch (error) {
    console.error('Error getting category:', error);
    res.status(500).json({ message: 'Failed to get category' });
  }
};

/**
 * @desc    Create new category
 * @route   POST /api/qa/knowledge/categories
 * @access  Private (Admin only)
 */
exports.createCategory = async (req, res) => {
  try {
    const { name, description, knowledge, keywords, evaluationCriteria, subcategories, images } = req.body;

    // Check if category already exists
    const existing = await QACategory.findOne({ name: { $regex: new RegExp(`^${name}$`, 'i') } });
    if (existing) {
      return res.status(400).json({ message: 'Category with this name already exists' });
    }

    const category = await QACategory.create({
      name,
      description,
      knowledge,
      keywords: keywords || [],
      evaluationCriteria,
      subcategories: subcategories || [],
      images: images || [],
      createdBy: req.user._id
    });

    await logActivity({
      level: 'info',
      message: 'QA Category created',
      module: 'knowledgeController',
      user: req.user._id,
      metadata: { categoryId: category._id, name },
      req
    });

    res.status(201).json(category);
  } catch (error) {
    console.error('Error creating category:', error);
    res.status(500).json({ message: 'Failed to create category' });
  }
};

/**
 * @desc    Update category
 * @route   PUT /api/qa/knowledge/categories/:id
 * @access  Private (Admin only)
 */
exports.updateCategory = async (req, res) => {
  try {
    const { name, description, knowledge, keywords, evaluationCriteria, subcategories, images, isActive } = req.body;

    const category = await QACategory.findById(req.params.id);
    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }

    // Prevent changing Basic Knowledge category name
    if (category.isBasicKnowledge && name && name !== category.name) {
      return res.status(400).json({ message: 'Cannot rename Basic Knowledge category' });
    }

    // Check for duplicate name (if changing name)
    if (name && name !== category.name) {
      const existing = await QACategory.findOne({
        name: { $regex: new RegExp(`^${name}$`, 'i') },
        _id: { $ne: category._id }
      });
      if (existing) {
        return res.status(400).json({ message: 'Category with this name already exists' });
      }
    }

    // Update fields
    if (name !== undefined && !category.isBasicKnowledge) category.name = name;
    if (description !== undefined) category.description = description;
    if (knowledge !== undefined) category.knowledge = knowledge;
    if (keywords !== undefined) category.keywords = keywords;
    if (evaluationCriteria !== undefined) category.evaluationCriteria = evaluationCriteria;
    if (subcategories !== undefined) category.subcategories = subcategories;
    if (images !== undefined) category.images = images;
    if (isActive !== undefined && !category.isBasicKnowledge) category.isActive = isActive;
    category.updatedBy = req.user._id;

    await category.save();

    await logActivity({
      level: 'info',
      message: 'QA Category updated',
      module: 'knowledgeController',
      user: req.user._id,
      metadata: { categoryId: category._id },
      req
    });

    res.json(category);
  } catch (error) {
    console.error('Error updating category:', error);
    res.status(500).json({ message: 'Failed to update category' });
  }
};

/**
 * @desc    Delete category
 * @route   DELETE /api/qa/knowledge/categories/:id
 * @access  Private (Admin only)
 */
exports.deleteCategory = async (req, res) => {
  try {
    const category = await QACategory.findById(req.params.id);
    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }

    // Prevent deleting Basic Knowledge category
    if (category.isBasicKnowledge) {
      return res.status(400).json({ message: 'Cannot delete Basic Knowledge category' });
    }

    await QACategory.findByIdAndDelete(req.params.id);

    await logActivity({
      level: 'info',
      message: 'QA Category deleted',
      module: 'knowledgeController',
      user: req.user._id,
      metadata: { categoryId: req.params.id, name: category.name },
      req
    });

    res.json({ message: 'Category deleted' });
  } catch (error) {
    console.error('Error deleting category:', error);
    res.status(500).json({ message: 'Failed to delete category' });
  }
};

/**
 * @desc    Add subcategory to category
 * @route   POST /api/qa/knowledge/categories/:id/subcategories
 * @access  Private (Admin only)
 */
exports.addSubcategory = async (req, res) => {
  try {
    const { name, description, knowledge, keywords, examples, evaluationCriteria, images } = req.body;

    const category = await QACategory.findById(req.params.id);
    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }

    // Check if subcategory with same name exists
    const existingSubcat = category.subcategories.find(
      sub => sub.name.toLowerCase() === name.toLowerCase()
    );
    if (existingSubcat) {
      return res.status(400).json({ message: 'Subcategory with this name already exists' });
    }

    category.subcategories.push({
      name,
      description,
      knowledge,
      keywords: keywords || [],
      examples: examples || [],
      evaluationCriteria,
      images: images || []
    });

    category.updatedBy = req.user._id;
    await category.save();

    res.status(201).json(category);
  } catch (error) {
    console.error('Error adding subcategory:', error);
    res.status(500).json({ message: 'Failed to add subcategory' });
  }
};

/**
 * @desc    Update subcategory
 * @route   PUT /api/qa/knowledge/categories/:id/subcategories/:subId
 * @access  Private (Admin only)
 */
exports.updateSubcategory = async (req, res) => {
  try {
    const { name, description, knowledge, keywords, examples, evaluationCriteria, images, isActive } = req.body;

    const category = await QACategory.findById(req.params.id);
    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }

    const subcategory = category.subcategories.id(req.params.subId);
    if (!subcategory) {
      return res.status(404).json({ message: 'Subcategory not found' });
    }

    // Update fields
    if (name !== undefined) subcategory.name = name;
    if (description !== undefined) subcategory.description = description;
    if (knowledge !== undefined) subcategory.knowledge = knowledge;
    if (keywords !== undefined) subcategory.keywords = keywords;
    if (examples !== undefined) subcategory.examples = examples;
    if (evaluationCriteria !== undefined) subcategory.evaluationCriteria = evaluationCriteria;
    if (images !== undefined) subcategory.images = images;
    if (isActive !== undefined) subcategory.isActive = isActive;

    category.updatedBy = req.user._id;
    await category.save();

    res.json(category);
  } catch (error) {
    console.error('Error updating subcategory:', error);
    res.status(500).json({ message: 'Failed to update subcategory' });
  }
};

/**
 * @desc    Delete subcategory
 * @route   DELETE /api/qa/knowledge/categories/:id/subcategories/:subId
 * @access  Private (Admin only)
 */
exports.deleteSubcategory = async (req, res) => {
  try {
    const category = await QACategory.findById(req.params.id);
    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }

    const subcategory = category.subcategories.id(req.params.subId);
    if (!subcategory) {
      return res.status(404).json({ message: 'Subcategory not found' });
    }

    subcategory.deleteOne();
    category.updatedBy = req.user._id;
    await category.save();

    res.json({ message: 'Subcategory deleted' });
  } catch (error) {
    console.error('Error deleting subcategory:', error);
    res.status(500).json({ message: 'Failed to delete subcategory' });
  }
};

/**
 * @desc    Get knowledge for AI (all categories formatted)
 * @route   GET /api/qa/knowledge/ai
 * @access  Private
 */
exports.getKnowledgeForAI = async (req, res) => {
  try {
    const knowledge = await QACategory.getKnowledgeForAI();
    res.json(knowledge);
  } catch (error) {
    console.error('Error getting knowledge for AI:', error);
    res.status(500).json({ message: 'Failed to get knowledge' });
  }
};

// ============================================
// FLAGGED TICKETS ENDPOINTS
// ============================================

/**
 * @desc    Get flagged tickets for a session
 * @route   GET /api/qa/knowledge/flagged/:sessionId
 * @access  Private
 */
exports.getFlaggedTickets = async (req, res) => {
  try {
    const { page = 1, limit = 50, flag, imported } = req.query;

    const options = {
      page: parseInt(page),
      limit: parseInt(limit)
    };
    if (flag) options.flag = flag;
    if (imported !== undefined) options.imported = imported === 'true';

    const tickets = await FlaggedTicket.getBySession(req.params.sessionId, options);
    const total = await FlaggedTicket.countDocuments({ scrapeSession: req.params.sessionId });

    res.json({
      tickets,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error getting flagged tickets:', error);
    res.status(500).json({ message: 'Failed to get flagged tickets' });
  }
};

/**
 * @desc    Get flagged ticket stats for a session
 * @route   GET /api/qa/knowledge/flagged/:sessionId/stats
 * @access  Private
 */
exports.getFlaggedStats = async (req, res) => {
  try {
    const stats = await FlaggedTicket.getSessionStats(req.params.sessionId);
    const categoryBreakdown = await FlaggedTicket.getCategoryBreakdown(req.params.sessionId);

    res.json({
      ...stats,
      categoryBreakdown
    });
  } catch (error) {
    console.error('Error getting flagged stats:', error);
    res.status(500).json({ message: 'Failed to get stats' });
  }
};

/**
 * @desc    Update QA review for flagged ticket
 * @route   PUT /api/qa/knowledge/flagged/:id/review
 * @access  Private
 */
exports.updateFlaggedReview = async (req, res) => {
  try {
    const { overrideFlag, notes } = req.body;

    const ticket = await FlaggedTicket.findById(req.params.id);
    if (!ticket) {
      return res.status(404).json({ message: 'Flagged ticket not found' });
    }

    ticket.qaReview = {
      reviewed: true,
      overrideFlag: overrideFlag || null,
      notes: notes || '',
      reviewedBy: req.user._id,
      reviewedAt: new Date()
    };

    await ticket.save();

    res.json(ticket);
  } catch (error) {
    console.error('Error updating flagged review:', error);
    res.status(500).json({ message: 'Failed to update review' });
  }
};

/**
 * @desc    Import flagged ticket to QA session
 * @route   POST /api/qa/knowledge/flagged/:id/import
 * @access  Private
 */
exports.importFlaggedTicket = async (req, res) => {
  try {
    const ticket = await FlaggedTicket.findById(req.params.id)
      .populate('scrapedConversation');

    if (!ticket) {
      return res.status(404).json({ message: 'Flagged ticket not found' });
    }

    if (ticket.imported) {
      return res.status(400).json({ message: 'Ticket already imported' });
    }

    // Mark as imported
    ticket.imported = true;
    ticket.importedAt = new Date();
    ticket.importedBy = req.user._id;

    await ticket.save();

    res.json({
      message: 'Ticket imported successfully',
      ticket
    });
  } catch (error) {
    console.error('Error importing flagged ticket:', error);
    res.status(500).json({ message: 'Failed to import ticket' });
  }
};

/**
 * @desc    Bulk import flagged tickets
 * @route   POST /api/qa/knowledge/flagged/bulk-import
 * @access  Private
 */
exports.bulkImportFlaggedTickets = async (req, res) => {
  try {
    const { ticketIds } = req.body;

    if (!ticketIds || !Array.isArray(ticketIds) || ticketIds.length === 0) {
      return res.status(400).json({ message: 'No ticket IDs provided' });
    }

    const result = await FlaggedTicket.updateMany(
      {
        _id: { $in: ticketIds },
        imported: false
      },
      {
        $set: {
          imported: true,
          importedAt: new Date(),
          importedBy: req.user._id
        }
      }
    );

    res.json({
      message: `${result.modifiedCount} tickets imported successfully`,
      modifiedCount: result.modifiedCount
    });
  } catch (error) {
    console.error('Error bulk importing flagged tickets:', error);
    res.status(500).json({ message: 'Failed to bulk import tickets' });
  }
};

// ============================================
// EMBEDDINGS SYNC ENDPOINTS
// ============================================

/**
 * @desc    Get sync status - how many rules and chunks exist
 * @route   GET /api/qa/knowledge/embeddings/status
 * @access  Private (Admin only)
 */
exports.getEmbeddingsStatus = async (req, res) => {
  try {
    const rulesCount = await Rule.countDocuments({ isActive: true });
    const chunksCount = await RuleChunk.countDocuments({ isActive: true });
    const chunksWithEmbeddings = await RuleChunk.countDocuments({
      isActive: true,
      embedding: { $exists: true, $ne: [] }
    });

    // Get rules without chunks
    const allRules = await Rule.find({ isActive: true }).select('rule_id').lean();
    const allChunks = await RuleChunk.find({ isActive: true }).select('rule_id').lean();
    const chunkRuleIds = new Set(allChunks.map(c => c.rule_id));
    const rulesWithoutChunks = allRules.filter(r => !chunkRuleIds.has(r.rule_id));

    res.json({
      rules: {
        total: rulesCount,
        withoutChunks: rulesWithoutChunks.length,
        missingRuleIds: rulesWithoutChunks.map(r => r.rule_id)
      },
      chunks: {
        total: chunksCount,
        withEmbeddings: chunksWithEmbeddings,
        withoutEmbeddings: chunksCount - chunksWithEmbeddings
      },
      syncNeeded: rulesWithoutChunks.length > 0 || (chunksCount - chunksWithEmbeddings) > 0,
      embeddingModel: embeddingsService.EMBEDDING_MODEL
    });
  } catch (error) {
    console.error('Error getting embeddings status:', error);
    res.status(500).json({ message: 'Failed to get status' });
  }
};

/**
 * @desc    Sync all rules to chunks with embeddings
 * @route   POST /api/qa/knowledge/embeddings/sync
 * @access  Private (Admin only)
 */
exports.syncEmbeddings = async (req, res) => {
  try {
    console.log('Starting embeddings sync...');

    const stats = await embeddingsService.syncAllChunks();

    console.log('Embeddings sync completed:', stats);

    await logActivity({
      level: 'info',
      message: 'Embeddings synced',
      module: 'knowledgeController',
      user: req.user._id,
      metadata: stats,
      req
    });

    res.json({
      message: 'Sync completed',
      stats
    });
  } catch (error) {
    console.error('Error syncing embeddings:', error);
    res.status(500).json({ message: 'Failed to sync embeddings', error: error.message });
  }
};

/**
 * @desc    Force regenerate all embeddings (use if model changed)
 * @route   POST /api/qa/knowledge/embeddings/regenerate
 * @access  Private (Admin only)
 */
exports.regenerateAllEmbeddings = async (req, res) => {
  try {
    console.log('Starting full embeddings regeneration...');

    // Delete all existing chunks
    await RuleChunk.deleteMany({});

    // Get all active rules
    const rules = await Rule.find({ isActive: true });

    let created = 0;
    const errors = [];

    for (const rule of rules) {
      try {
        await embeddingsService.createRuleChunk(rule);
        created++;
        console.log(`Created chunk for rule: ${rule.rule_id}`);
      } catch (error) {
        console.error(`Error creating chunk for ${rule.rule_id}:`, error.message);
        errors.push({ rule_id: rule.rule_id, error: error.message });
      }
    }

    console.log('Regeneration completed:', { created, errors: errors.length });

    await logActivity({
      level: 'info',
      message: 'All embeddings regenerated',
      module: 'knowledgeController',
      user: req.user._id,
      metadata: { created, errors: errors.length },
      req
    });

    res.json({
      message: 'Regeneration completed',
      stats: { created, total: rules.length, errors }
    });
  } catch (error) {
    console.error('Error regenerating embeddings:', error);
    res.status(500).json({ message: 'Failed to regenerate embeddings', error: error.message });
  }
};
