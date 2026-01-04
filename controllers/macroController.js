const Macro = require('../models/Macro');
const logger = require('../utils/logger');

// ============================================
// MACRO CONTROLLERS
// ============================================

// @desc    Get all macros for current user
// @route   GET /api/qa/macros
// @access  Private
exports.getAllMacros = async (req, res) => {
  try {
    const userId = req.user._id;
    const macros = await Macro.find({ createdBy: userId })
      .sort({ usageCount: -1, title: 1 });
    res.json(macros);
  } catch (error) {
    logger.error('Error fetching macros:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Get single macro
// @route   GET /api/qa/macros/:id
// @access  Private
exports.getMacro = async (req, res) => {
  try {
    const userId = req.user._id;
    const macro = await Macro.findOne({
      _id: req.params.id,
      createdBy: userId
    });

    if (!macro) {
      return res.status(404).json({ message: 'Macro not found' });
    }

    res.json(macro);
  } catch (error) {
    logger.error('Error fetching macro:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Search macros by title (partial match)
// @route   GET /api/qa/macros/search?q=term
// @access  Private
exports.searchMacros = async (req, res) => {
  try {
    const userId = req.user._id;
    const searchTerm = req.query.q || '';

    const macros = await Macro.find({
      createdBy: userId,
      title: { $regex: searchTerm, $options: 'i' }
    })
      .sort({ usageCount: -1, title: 1 })
      .limit(20);

    res.json(macros);
  } catch (error) {
    logger.error('Error searching macros:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Create new macro
// @route   POST /api/qa/macros
// @access  Private
exports.createMacro = async (req, res) => {
  try {
    const userId = req.user._id;
    const { title, feedback } = req.body;

    if (!title || !feedback) {
      return res.status(400).json({ message: 'Title and feedback are required' });
    }

    // Check if macro with same title already exists for this user
    const existingMacro = await Macro.findOne({
      createdBy: userId,
      title: { $regex: `^${title.trim()}$`, $options: 'i' }
    });

    if (existingMacro) {
      return res.status(400).json({ message: 'A macro with this title already exists' });
    }

    const macro = await Macro.create({
      title: title.trim(),
      feedback,
      createdBy: userId
    });

    res.status(201).json(macro);
  } catch (error) {
    logger.error('Error creating macro:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Update macro
// @route   PUT /api/qa/macros/:id
// @access  Private
exports.updateMacro = async (req, res) => {
  try {
    const userId = req.user._id;
    const { title, feedback } = req.body;

    const macro = await Macro.findOne({
      _id: req.params.id,
      createdBy: userId
    });

    if (!macro) {
      return res.status(404).json({ message: 'Macro not found' });
    }

    // Check if new title conflicts with another macro
    if (title && title.trim().toLowerCase() !== macro.title.toLowerCase()) {
      const existingMacro = await Macro.findOne({
        createdBy: userId,
        _id: { $ne: macro._id },
        title: { $regex: `^${title.trim()}$`, $options: 'i' }
      });

      if (existingMacro) {
        return res.status(400).json({ message: 'A macro with this title already exists' });
      }
    }

    if (title) macro.title = title.trim();
    if (feedback !== undefined) macro.feedback = feedback;

    await macro.save();

    res.json(macro);
  } catch (error) {
    logger.error('Error updating macro:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Delete macro
// @route   DELETE /api/qa/macros/:id
// @access  Private
exports.deleteMacro = async (req, res) => {
  try {
    const userId = req.user._id;

    const macro = await Macro.findOne({
      _id: req.params.id,
      createdBy: userId
    });

    if (!macro) {
      return res.status(404).json({ message: 'Macro not found' });
    }

    await Macro.deleteOne({ _id: macro._id });

    res.json({ message: 'Macro deleted successfully' });
  } catch (error) {
    logger.error('Error deleting macro:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Record macro usage for a ticket
// @route   POST /api/qa/macros/:id/use
// @access  Private
exports.recordMacroUsage = async (req, res) => {
  try {
    const userId = req.user._id;
    const { ticketId, ticketNumber } = req.body;

    const macro = await Macro.findOne({
      _id: req.params.id,
      createdBy: userId
    });

    if (!macro) {
      return res.status(404).json({ message: 'Macro not found' });
    }

    // Check if this ticket is already in usedInTickets
    const alreadyUsed = macro.usedInTickets.some(
      t => t.ticketId && t.ticketId.toString() === ticketId
    );

    if (!alreadyUsed && ticketId) {
      macro.usedInTickets.push({
        ticketId,
        ticketNumber: ticketNumber || '',
        usedAt: new Date()
      });
    }

    macro.usageCount += 1;
    macro.lastUsedAt = new Date();

    await macro.save();

    res.json(macro);
  } catch (error) {
    logger.error('Error recording macro usage:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Get tickets where macro was used (with pagination)
// @route   GET /api/qa/macros/:id/tickets
// @access  Private
exports.getMacroTickets = async (req, res) => {
  try {
    const userId = req.user._id;
    const { limit = 10, offset = 0 } = req.query;

    const macro = await Macro.findOne({
      _id: req.params.id,
      createdBy: userId
    }).populate({
      path: 'usedInTickets.ticketId',
      select: 'ticketId status qualityScorePercent dateEntered agent',
      populate: {
        path: 'agent',
        select: 'name'
      }
    });

    if (!macro) {
      return res.status(404).json({ message: 'Macro not found' });
    }

    // Sort by usedAt descending and paginate
    const sortedTickets = macro.usedInTickets
      .sort((a, b) => new Date(b.usedAt) - new Date(a.usedAt));

    const total = sortedTickets.length;
    const tickets = sortedTickets.slice(parseInt(offset), parseInt(offset) + parseInt(limit));

    res.json({
      tickets,
      total,
      hasMore: parseInt(offset) + parseInt(limit) < total
    });
  } catch (error) {
    logger.error('Error fetching macro tickets:', error);
    res.status(500).json({ message: 'Server error' });
  }
};
