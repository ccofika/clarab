const mongoose = require('mongoose');
const Macro = require('../models/Macro');
const logger = require('../utils/logger');

// ============================================
// MACRO CONTROLLERS
// ============================================

// @desc    Get all macros for current user (own + public + shared with user)
// @route   GET /api/qa/macros
// @access  Private
exports.getAllMacros = async (req, res) => {
  try {
    const userId = req.user._id;

    // Find macros where:
    // 1. User created them
    // 2. Macro is public
    // 3. Macro is shared with user
    const macros = await Macro.find({
      $or: [
        { createdBy: userId },
        { isPublic: true },
        { 'sharedWith.userId': userId }
      ]
    })
      .populate('createdBy', 'name email')
      .sort({ usageCount: -1, title: 1 });

    // Add ownership info to each macro
    const macrosWithOwnership = macros.map(macro => {
      const macroObj = macro.toObject();
      macroObj.isOwner = macro.createdBy._id.toString() === userId.toString();
      macroObj.isSharedWithMe = !macroObj.isOwner && !macro.isPublic &&
        macro.sharedWith.some(s => s.userId.toString() === userId.toString());
      return macroObj;
    });

    res.json(macrosWithOwnership);
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
      $or: [
        { createdBy: userId },
        { isPublic: true },
        { 'sharedWith.userId': userId }
      ]
    }).populate('createdBy', 'name email');

    if (!macro) {
      return res.status(404).json({ message: 'Macro not found' });
    }

    const macroObj = macro.toObject();
    macroObj.isOwner = macro.createdBy._id.toString() === userId.toString();
    macroObj.isSharedWithMe = !macroObj.isOwner && !macro.isPublic &&
      macro.sharedWith.some(s => s.userId.toString() === userId.toString());

    res.json(macroObj);
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
      $or: [
        { createdBy: userId },
        { isPublic: true },
        { 'sharedWith.userId': userId }
      ],
      title: { $regex: searchTerm, $options: 'i' }
    })
      .populate('createdBy', 'name email')
      .sort({ usageCount: -1, title: 1 })
      .limit(20);

    // Add ownership info to each macro
    const macrosWithOwnership = macros.map(macro => {
      const macroObj = macro.toObject();
      macroObj.isOwner = macro.createdBy._id.toString() === userId.toString();
      macroObj.isSharedWithMe = !macroObj.isOwner && !macro.isPublic &&
        macro.sharedWith.some(s => s.userId.toString() === userId.toString());
      return macroObj;
    });

    res.json(macrosWithOwnership);
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
    const { title, feedback, scorecardData, categories, isPublic, sharedWith } = req.body;

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

    const macroData = {
      title: title.trim(),
      feedback,
      createdBy: userId,
      isPublic: !!isPublic
    };

    // Add optional scorecard data if provided
    if (scorecardData && typeof scorecardData === 'object') {
      macroData.scorecardData = scorecardData;
    }

    // Add optional categories if provided
    if (categories && Array.isArray(categories)) {
      macroData.categories = categories;
    }

    // Add sharedWith if provided (array of user IDs)
    if (sharedWith && Array.isArray(sharedWith) && sharedWith.length > 0) {
      macroData.sharedWith = sharedWith.map(uid => ({
        userId: new mongoose.Types.ObjectId(uid),
        addedBy: userId // Owner is adding these users
      }));
    }

    const macro = await Macro.create(macroData);

    // Populate createdBy before returning
    await macro.populate('createdBy', 'name email');

    const macroObj = macro.toObject();
    macroObj.isOwner = true;
    macroObj.isSharedWithMe = false;

    res.status(201).json(macroObj);
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
    const { title, feedback, scorecardData, categories, isPublic, sharedWith } = req.body;

    // First find macro that user has access to
    const macro = await Macro.findOne({
      _id: req.params.id,
      $or: [
        { createdBy: userId },
        { isPublic: true },
        { 'sharedWith.userId': userId }
      ]
    });

    if (!macro) {
      return res.status(404).json({ message: 'Macro not found' });
    }

    const isOwner = macro.createdBy.toString() === userId.toString();

    // Only owner can update content (title, feedback, categories, scorecardData)
    if (isOwner) {
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
      if (scorecardData !== undefined) macro.scorecardData = scorecardData;
      if (categories !== undefined) macro.categories = categories;
    }

    // Anyone with access can update isPublic
    if (isPublic !== undefined) {
      macro.isPublic = !!isPublic;
    }

    // Handle sharedWith updates
    if (sharedWith !== undefined && Array.isArray(sharedWith)) {
      if (isOwner) {
        // Owner can fully replace sharedWith, need to handle cascade removal
        const oldUserIds = macro.sharedWith.map(s => s.userId.toString());
        const newUserIds = sharedWith;

        // Find users being removed
        const removedUserIds = oldUserIds.filter(uid => !newUserIds.includes(uid));

        // For cascade removal: find all users that were added by removed users
        const cascadeRemove = (userIdToRemove) => {
          const addedByThisUser = macro.sharedWith
            .filter(s => s.addedBy.toString() === userIdToRemove)
            .map(s => s.userId.toString());

          // Recursively find users added by those users
          let allToRemove = [userIdToRemove];
          addedByThisUser.forEach(uid => {
            if (!newUserIds.includes(uid)) {
              allToRemove = allToRemove.concat(cascadeRemove(uid));
            }
          });
          return allToRemove;
        };

        let allRemovedIds = [];
        removedUserIds.forEach(uid => {
          allRemovedIds = allRemovedIds.concat(cascadeRemove(uid));
        });
        allRemovedIds = [...new Set(allRemovedIds)]; // Remove duplicates

        // Build new sharedWith array
        const newSharedWith = [];
        newUserIds.forEach(uid => {
          // Check if this user already exists in sharedWith (not being removed)
          const existing = macro.sharedWith.find(s =>
            s.userId.toString() === uid && !allRemovedIds.includes(uid)
          );
          if (existing) {
            newSharedWith.push(existing);
          } else if (!allRemovedIds.includes(uid)) {
            // New user being added by owner
            newSharedWith.push({
              userId: new mongoose.Types.ObjectId(uid),
              addedBy: userId
            });
          }
        });

        macro.sharedWith = newSharedWith;
      } else {
        // Non-owner can only ADD new users (not remove)
        const existingUserIds = macro.sharedWith.map(s => s.userId.toString());
        const newUsers = sharedWith.filter(uid => !existingUserIds.includes(uid));

        newUsers.forEach(uid => {
          macro.sharedWith.push({
            userId: new mongoose.Types.ObjectId(uid),
            addedBy: userId
          });
        });
      }
    }

    await macro.save();
    await macro.populate('createdBy', 'name email');

    const macroObj = macro.toObject();
    macroObj.isOwner = isOwner;
    macroObj.isSharedWithMe = !isOwner && !macro.isPublic &&
      macro.sharedWith.some(s => s.userId.toString() === userId.toString());

    res.json(macroObj);
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

    // Allow usage of any macro user has access to
    const macro = await Macro.findOne({
      _id: req.params.id,
      $or: [
        { createdBy: userId },
        { isPublic: true },
        { 'sharedWith.userId': userId }
      ]
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
    await macro.populate('createdBy', 'name email');

    const macroObj = macro.toObject();
    macroObj.isOwner = macro.createdBy._id.toString() === userId.toString();

    res.json(macroObj);
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

    // Allow access to tickets for any macro user has access to
    const macro = await Macro.findOne({
      _id: req.params.id,
      $or: [
        { createdBy: userId },
        { isPublic: true },
        { 'sharedWith.userId': userId }
      ]
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

// @desc    Get QA graders for sharing macros
// @route   GET /api/qa/macros/graders
// @access  Private
exports.getQAGradersForSharing = async (req, res) => {
  try {
    const userId = req.user._id;
    const User = require('../models/User');
    const QAAllowedEmail = require('../models/QAAllowedEmail');

    // Get all allowed QA emails from database
    const allowedEmails = await QAAllowedEmail.find({}).select('email');
    const emailList = allowedEmails.map(e => e.email.toLowerCase());

    // Get users who are QA graders (excluding current user)
    const graders = await User.find({
      email: { $in: emailList },
      _id: { $ne: userId }
    }).select('_id name email');

    res.json(graders);
  } catch (error) {
    logger.error('Error fetching QA graders:', error);
    res.status(500).json({ message: 'Server error' });
  }
};
