const mongoose = require('mongoose');
const Macro = require('../models/Macro');
const logger = require('../utils/logger');

// ============================================
// MACRO CONTROLLERS
// ============================================

// Admin emails that have access to all macros
const MACRO_ADMIN_EMAILS = ['filipkozomara@mebit.io', 'nevena@mebit.io'];

// Helper to check if user is a macro admin
const isMacroAdmin = (userEmail) => {
  return MACRO_ADMIN_EMAILS.includes(userEmail?.toLowerCase());
};

// @desc    Get all macros for current user (own + public + shared with user)
// @route   GET /api/qa/macros?creatorId=xxx (optional, admin only)
// @access  Private
exports.getAllMacros = async (req, res) => {
  try {
    const userId = req.user._id;
    const userEmail = req.user.email;
    const isAdmin = isMacroAdmin(userEmail);
    const { creatorId } = req.query;

    let macros;

    // If admin and creatorId is specified, get all macros by that creator
    if (isAdmin && creatorId) {
      macros = await Macro.find({ createdBy: creatorId })
        .populate('createdBy', 'name email')
        .sort({ usageCount: -1, title: 1 });
    } else {
      // Normal query: own + public + shared with user
      macros = await Macro.find({
        $or: [
          { createdBy: userId },
          { isPublic: true },
          { 'sharedWith.userId': userId }
        ]
      })
        .populate('createdBy', 'name email')
        .sort({ usageCount: -1, title: 1 });
    }

    // Add ownership info to each macro
    const macrosWithOwnership = macros.map(macro => {
      const macroObj = macro.toObject();
      const isActualOwner = macro.createdBy._id.toString() === userId.toString();

      // For admins viewing others' macros via creatorId filter, grant edit access
      // but keep isOwner false so "Created by" still shows the original creator
      macroObj.isOwner = isActualOwner;
      macroObj.isSharedWithMe = !isActualOwner && !macro.isPublic &&
        macro.sharedWith.some(s => s.userId.toString() === userId.toString());

      // Admin flag for frontend to know they can edit
      if (isAdmin && !isActualOwner) {
        macroObj.canAdminEdit = true;
      }

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
    const userEmail = req.user.email;
    const isAdmin = isMacroAdmin(userEmail);

    let macro;

    if (isAdmin) {
      // Admins can access any macro
      macro = await Macro.findById(req.params.id).populate('createdBy', 'name email');
    } else {
      macro = await Macro.findOne({
        _id: req.params.id,
        $or: [
          { createdBy: userId },
          { isPublic: true },
          { 'sharedWith.userId': userId }
        ]
      }).populate('createdBy', 'name email');
    }

    if (!macro) {
      return res.status(404).json({ message: 'Macro not found' });
    }

    const macroObj = macro.toObject();
    const isActualOwner = macro.createdBy._id.toString() === userId.toString();
    macroObj.isOwner = isActualOwner;
    macroObj.isSharedWithMe = !isActualOwner && !macro.isPublic &&
      macro.sharedWith.some(s => s.userId.toString() === userId.toString());

    // Admin flag for frontend
    if (isAdmin && !isActualOwner) {
      macroObj.canAdminEdit = true;
    }

    res.json(macroObj);
  } catch (error) {
    logger.error('Error fetching macro:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Search macros by title (partial match)
// @route   GET /api/qa/macros/search?q=term&creatorId=xxx (optional, admin only)
// @access  Private
exports.searchMacros = async (req, res) => {
  try {
    const userId = req.user._id;
    const userEmail = req.user.email;
    const isAdmin = isMacroAdmin(userEmail);
    const searchTerm = req.query.q || '';
    const { creatorId } = req.query;

    let query;

    // If admin and creatorId is specified, search only that creator's macros
    if (isAdmin && creatorId) {
      query = {
        createdBy: creatorId,
        title: { $regex: searchTerm, $options: 'i' }
      };
    } else {
      // Normal query: own + public + shared with user
      query = {
        $or: [
          { createdBy: userId },
          { isPublic: true },
          { 'sharedWith.userId': userId }
        ],
        title: { $regex: searchTerm, $options: 'i' }
      };
    }

    const macros = await Macro.find(query)
      .populate('createdBy', 'name email')
      .sort({ usageCount: -1, title: 1 })
      .limit(20);

    // Add ownership info to each macro
    const macrosWithOwnership = macros.map(macro => {
      const macroObj = macro.toObject();
      const isActualOwner = macro.createdBy._id.toString() === userId.toString();
      macroObj.isOwner = isActualOwner;
      macroObj.isSharedWithMe = !isActualOwner && !macro.isPublic &&
        macro.sharedWith.some(s => s.userId.toString() === userId.toString());

      // Admin flag for frontend
      if (isAdmin && !isActualOwner) {
        macroObj.canAdminEdit = true;
      }

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
    const userEmail = req.user.email;
    const isAdmin = isMacroAdmin(userEmail);
    const { title, feedback, scorecardData, categories, isPublic, sharedWith } = req.body;

    let macro;

    if (isAdmin) {
      // Admins can access any macro
      macro = await Macro.findById(req.params.id);
    } else {
      // Regular users: find macro they have access to
      macro = await Macro.findOne({
        _id: req.params.id,
        $or: [
          { createdBy: userId },
          { isPublic: true },
          { 'sharedWith.userId': userId }
        ]
      });
    }

    if (!macro) {
      return res.status(404).json({ message: 'Macro not found' });
    }

    const isOwner = macro.createdBy.toString() === userId.toString();
    // Admins can edit like owners (but don't become the owner)
    const canEditContent = isOwner || isAdmin;

    // Owner or admin can update content (title, feedback, categories, scorecardData)
    if (canEditContent) {
      // Check if new title conflicts with another macro (check against original creator's macros)
      if (title && title.trim().toLowerCase() !== macro.title.toLowerCase()) {
        const existingMacro = await Macro.findOne({
          createdBy: macro.createdBy, // Check against original creator, not current user
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
      if (isOwner || isAdmin) {
        // Owner or admin can fully replace sharedWith, need to handle cascade removal
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
            // New user being added by owner/admin (use macro creator as addedBy)
            newSharedWith.push({
              userId: new mongoose.Types.ObjectId(uid),
              addedBy: isOwner ? userId : macro.createdBy
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

    // Admin flag for frontend
    if (isAdmin && !isOwner) {
      macroObj.canAdminEdit = true;
    }

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

// @desc    Get QA graders with macro counts (admin only)
// @route   GET /api/qa/macros/graders-with-counts
// @access  Private (admin only)
exports.getQAGradersWithMacroCounts = async (req, res) => {
  try {
    const userEmail = req.user.email;

    // Only admins can access this endpoint
    if (!isMacroAdmin(userEmail)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const User = require('../models/User');
    const QAAllowedEmail = require('../models/QAAllowedEmail');

    // Get all allowed QA emails from database
    const allowedEmails = await QAAllowedEmail.find({}).select('email');
    const emailList = allowedEmails.map(e => e.email.toLowerCase());

    // Get users who are QA graders
    const graders = await User.find({
      email: { $in: emailList }
    }).select('_id name email');

    // Get macro counts per creator
    const macroCounts = await Macro.aggregate([
      {
        $group: {
          _id: '$createdBy',
          count: { $sum: 1 }
        }
      }
    ]);

    // Create a map of userId -> count
    const countMap = {};
    macroCounts.forEach(item => {
      countMap[item._id.toString()] = item.count;
    });

    // Add counts to graders
    const gradersWithCounts = graders.map(grader => ({
      _id: grader._id,
      name: grader.name,
      email: grader.email,
      macroCount: countMap[grader._id.toString()] || 0
    }));

    // Sort by name
    gradersWithCounts.sort((a, b) => a.name.localeCompare(b.name));

    res.json(gradersWithCounts);
  } catch (error) {
    logger.error('Error fetching QA graders with counts:', error);
    res.status(500).json({ message: 'Server error' });
  }
};
