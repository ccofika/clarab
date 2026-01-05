const Rule = require('../models/Rule');
const RuleChunk = require('../models/RuleChunk');
const QACategory = require('../models/QACategory');
const embeddingsService = require('../services/embeddingsService');
const { logActivity } = require('../utils/activityLogger');

/**
 * @desc    Get all rules (optionally filtered by category)
 * @route   GET /api/qa/rules
 * @access  Private
 */
exports.getRules = async (req, res) => {
  try {
    const { category, subcategory, tags, severity, search, page = 1, limit = 50 } = req.query;

    const query = { isActive: true };

    if (category) {
      query.category = category;
    }
    if (subcategory) {
      query.subcategory = subcategory;
    }
    if (severity) {
      query.severity_default = severity;
    }
    if (tags) {
      const tagList = tags.split(',').map(t => t.trim());
      query.tags = { $in: tagList };
    }
    if (search) {
      query.$text = { $search: search };
    }

    const rules = await Rule.find(query)
      .populate('category', 'name')
      .sort({ category_name: 1, title: 1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit));

    const total = await Rule.countDocuments(query);

    res.json({
      rules,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error getting rules:', error);
    res.status(500).json({ message: 'Failed to get rules' });
  }
};

/**
 * @desc    Get single rule
 * @route   GET /api/qa/rules/:id
 * @access  Private
 */
exports.getRule = async (req, res) => {
  try {
    const rule = await Rule.findById(req.params.id)
      .populate('category', 'name');

    if (!rule) {
      return res.status(404).json({ message: 'Rule not found' });
    }

    res.json(rule);
  } catch (error) {
    console.error('Error getting rule:', error);
    res.status(500).json({ message: 'Failed to get rule' });
  }
};

/**
 * @desc    Create new rule
 * @route   POST /api/qa/rules
 * @access  Private (Admin)
 */
exports.createRule = async (req, res) => {
  try {
    const {
      category,
      subcategory,
      title,
      intent,
      rule_text,
      steps,
      allowed_actions,
      disallowed_actions,
      conditions,
      exceptions,
      examples_good,
      examples_bad,
      tags,
      severity_default,
      evidence_requirements,
      verification_checks,
      source_location
    } = req.body;

    // Validate required fields
    if (!category || !title || !intent || !rule_text) {
      return res.status(400).json({
        message: 'Category, title, intent, and rule_text are required'
      });
    }

    // Get category name
    const categoryDoc = await QACategory.findById(category);
    if (!categoryDoc) {
      return res.status(400).json({ message: 'Category not found' });
    }

    // Generate stable rule_id
    const rule_id = Rule.generateRuleId(categoryDoc.name, title);

    // Check for duplicate rule_id
    const existing = await Rule.findOne({ rule_id });
    if (existing) {
      return res.status(400).json({ message: 'A rule with this title already exists in this category' });
    }

    // Create rule
    const rule = await Rule.create({
      rule_id,
      category,
      category_name: categoryDoc.name,
      subcategory: subcategory || '',
      title,
      intent,
      rule_text,
      steps: steps || [],
      allowed_actions: allowed_actions || [],
      disallowed_actions: disallowed_actions || [],
      conditions: conditions || [],
      exceptions: exceptions || [],
      examples_good: examples_good || [],
      examples_bad: examples_bad || [],
      tags: tags || [],
      severity_default: severity_default || 'medium',
      evidence_requirements: evidence_requirements || '',
      verification_checks: verification_checks || [],
      source_location: source_location || {},
      createdBy: req.user._id
    });

    // Create embedding chunk
    try {
      await embeddingsService.createRuleChunk(rule);
    } catch (embeddingError) {
      console.error('Error creating embedding (rule created anyway):', embeddingError);
    }

    await logActivity({
      level: 'info',
      message: 'Rule created',
      module: 'rulesController',
      user: req.user._id,
      metadata: { rule_id: rule.rule_id, title },
      req
    });

    res.status(201).json(rule);
  } catch (error) {
    console.error('Error creating rule:', error);
    res.status(500).json({ message: 'Failed to create rule' });
  }
};

/**
 * @desc    Update rule
 * @route   PUT /api/qa/rules/:id
 * @access  Private (Admin)
 */
exports.updateRule = async (req, res) => {
  try {
    const rule = await Rule.findById(req.params.id);
    if (!rule) {
      return res.status(404).json({ message: 'Rule not found' });
    }

    const {
      category,
      subcategory,
      title,
      intent,
      rule_text,
      steps,
      allowed_actions,
      disallowed_actions,
      conditions,
      exceptions,
      examples_good,
      examples_bad,
      tags,
      severity_default,
      evidence_requirements,
      verification_checks,
      source_location,
      isActive
    } = req.body;

    // If category changed, update category_name
    if (category && category !== rule.category.toString()) {
      const categoryDoc = await QACategory.findById(category);
      if (!categoryDoc) {
        return res.status(400).json({ message: 'Category not found' });
      }
      rule.category = category;
      rule.category_name = categoryDoc.name;

      // Regenerate rule_id if title or category changed
      if (title && title !== rule.title) {
        rule.rule_id = Rule.generateRuleId(categoryDoc.name, title);
      }
    }

    // Update fields
    if (subcategory !== undefined) rule.subcategory = subcategory;
    if (title !== undefined) rule.title = title;
    if (intent !== undefined) rule.intent = intent;
    if (rule_text !== undefined) rule.rule_text = rule_text;
    if (steps !== undefined) rule.steps = steps;
    if (allowed_actions !== undefined) rule.allowed_actions = allowed_actions;
    if (disallowed_actions !== undefined) rule.disallowed_actions = disallowed_actions;
    if (conditions !== undefined) rule.conditions = conditions;
    if (exceptions !== undefined) rule.exceptions = exceptions;
    if (examples_good !== undefined) rule.examples_good = examples_good;
    if (examples_bad !== undefined) rule.examples_bad = examples_bad;
    if (tags !== undefined) rule.tags = tags;
    if (severity_default !== undefined) rule.severity_default = severity_default;
    if (evidence_requirements !== undefined) rule.evidence_requirements = evidence_requirements;
    if (verification_checks !== undefined) rule.verification_checks = verification_checks;
    if (source_location !== undefined) rule.source_location = source_location;
    if (isActive !== undefined) rule.isActive = isActive;

    rule.updatedBy = req.user._id;
    await rule.save();

    // Update embedding chunk
    try {
      const chunk = await RuleChunk.findOne({ rule_id: rule.rule_id });
      if (chunk) {
        chunk.embedding_input = rule.getEmbeddingInput();
        chunk.embedding = await embeddingsService.generateEmbedding(chunk.embedding_input);
        chunk.metadata = {
          category: rule.category,
          category_name: rule.category_name,
          subcategory: rule.subcategory,
          tags: rule.tags,
          severity: rule.severity_default,
          source_location: rule.source_location
        };
        chunk.token_count = Math.ceil(chunk.embedding_input.length / 4);
        await chunk.save();
      } else {
        await embeddingsService.createRuleChunk(rule);
      }
    } catch (embeddingError) {
      console.error('Error updating embedding:', embeddingError);
    }

    await logActivity({
      level: 'info',
      message: 'Rule updated',
      module: 'rulesController',
      user: req.user._id,
      metadata: { rule_id: rule.rule_id },
      req
    });

    res.json(rule);
  } catch (error) {
    console.error('Error updating rule:', error);
    res.status(500).json({ message: 'Failed to update rule' });
  }
};

/**
 * @desc    Delete rule
 * @route   DELETE /api/qa/rules/:id
 * @access  Private (Admin)
 */
exports.deleteRule = async (req, res) => {
  try {
    const rule = await Rule.findById(req.params.id);
    if (!rule) {
      return res.status(404).json({ message: 'Rule not found' });
    }

    // Soft delete - mark as inactive
    rule.isActive = false;
    rule.updatedBy = req.user._id;
    await rule.save();

    // Also deactivate the chunk
    await RuleChunk.updateOne(
      { rule_id: rule.rule_id },
      { isActive: false }
    );

    await logActivity({
      level: 'info',
      message: 'Rule deleted',
      module: 'rulesController',
      user: req.user._id,
      metadata: { rule_id: rule.rule_id, title: rule.title },
      req
    });

    res.json({ message: 'Rule deleted' });
  } catch (error) {
    console.error('Error deleting rule:', error);
    res.status(500).json({ message: 'Failed to delete rule' });
  }
};

/**
 * @desc    Get rules by category
 * @route   GET /api/qa/rules/category/:categoryId
 * @access  Private
 */
exports.getRulesByCategory = async (req, res) => {
  try {
    const rules = await Rule.find({
      category: req.params.categoryId,
      isActive: true
    })
    .sort({ subcategory: 1, title: 1 });

    // Group by subcategory
    const grouped = {};
    for (const rule of rules) {
      const subcat = rule.subcategory || 'General';
      if (!grouped[subcat]) {
        grouped[subcat] = [];
      }
      grouped[subcat].push(rule);
    }

    res.json({
      rules,
      grouped,
      total: rules.length
    });
  } catch (error) {
    console.error('Error getting rules by category:', error);
    res.status(500).json({ message: 'Failed to get rules' });
  }
};

/**
 * @desc    Sync all rule embeddings
 * @route   POST /api/qa/rules/sync-embeddings
 * @access  Private (Admin)
 */
exports.syncEmbeddings = async (req, res) => {
  try {
    const stats = await embeddingsService.syncAllChunks();

    await logActivity({
      level: 'info',
      message: 'Embeddings synced',
      module: 'rulesController',
      user: req.user._id,
      metadata: stats,
      req
    });

    res.json({
      message: 'Embeddings synced successfully',
      stats
    });
  } catch (error) {
    console.error('Error syncing embeddings:', error);
    res.status(500).json({ message: 'Failed to sync embeddings' });
  }
};

/**
 * @desc    Get all unique tags
 * @route   GET /api/qa/rules/tags
 * @access  Private
 */
exports.getAllTags = async (req, res) => {
  try {
    const tags = await Rule.aggregate([
      { $match: { isActive: true } },
      { $unwind: '$tags' },
      { $group: { _id: '$tags', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    res.json(tags.map(t => ({ tag: t._id, count: t.count })));
  } catch (error) {
    console.error('Error getting tags:', error);
    res.status(500).json({ message: 'Failed to get tags' });
  }
};

/**
 * @desc    Bulk create rules
 * @route   POST /api/qa/rules/bulk
 * @access  Private (Admin)
 */
exports.bulkCreateRules = async (req, res) => {
  try {
    const { rules } = req.body;

    if (!Array.isArray(rules) || rules.length === 0) {
      return res.status(400).json({ message: 'Rules array is required' });
    }

    const results = {
      created: 0,
      failed: 0,
      errors: []
    };

    for (const ruleData of rules) {
      try {
        // Validate
        if (!ruleData.category || !ruleData.title || !ruleData.intent || !ruleData.rule_text) {
          results.failed++;
          results.errors.push({ title: ruleData.title, error: 'Missing required fields' });
          continue;
        }

        // Get category
        const categoryDoc = await QACategory.findById(ruleData.category);
        if (!categoryDoc) {
          results.failed++;
          results.errors.push({ title: ruleData.title, error: 'Category not found' });
          continue;
        }

        // Generate rule_id
        const rule_id = Rule.generateRuleId(categoryDoc.name, ruleData.title);

        // Check duplicate
        const existing = await Rule.findOne({ rule_id });
        if (existing) {
          results.failed++;
          results.errors.push({ title: ruleData.title, error: 'Rule already exists' });
          continue;
        }

        // Create rule
        const rule = await Rule.create({
          ...ruleData,
          rule_id,
          category_name: categoryDoc.name,
          createdBy: req.user._id
        });

        // Create embedding
        try {
          await embeddingsService.createRuleChunk(rule);
        } catch (e) {
          console.error('Embedding error for rule:', rule.rule_id, e);
        }

        results.created++;
      } catch (error) {
        results.failed++;
        results.errors.push({ title: ruleData.title, error: error.message });
      }
    }

    res.json({
      message: `Created ${results.created} rules, ${results.failed} failed`,
      results
    });
  } catch (error) {
    console.error('Error bulk creating rules:', error);
    res.status(500).json({ message: 'Failed to bulk create rules' });
  }
};
