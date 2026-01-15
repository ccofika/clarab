const Agent = require('../models/Agent');
const Ticket = require('../models/Ticket');
const logger = require('../utils/logger');
const ExcelJS = require('exceljs');
const {
  generateEmbedding,
  cosineSimilarity
} = require('../utils/openai');

// ============================================
// AGENT CONTROLLERS
// ============================================

// @desc    Get all agents active for current user
// @route   GET /api/qa/agents
// @access  Private
exports.getAllAgents = async (req, res) => {
  try {
    const userId = req.user._id;
    // Filter agents where current user is in activeForUsers array
    const agents = await Agent.find({
      activeForUsers: userId,
      isRemoved: false
    }).sort({ name: 1 });

    // Get ticket counts for each agent (only for current user's tickets)
    const agentsWithStats = await Promise.all(
      agents.map(async (agent) => {
        const totalTickets = await Ticket.countDocuments({
          agent: agent._id,
          isArchived: false,
          createdBy: userId
        });
        const gradedTickets = await Ticket.countDocuments({
          agent: agent._id,
          status: 'Graded',
          isArchived: false,
          createdBy: userId
        });
        const avgScore = await Ticket.aggregate([
          {
            $match: {
              agent: agent._id,
              isArchived: false,
              qualityScorePercent: { $ne: null },
              createdBy: userId
            }
          },
          { $group: { _id: null, avgScore: { $avg: '$qualityScorePercent' } } }
        ]);

        return {
          ...agent.toObject(),
          stats: {
            totalTickets,
            gradedTickets,
            avgScore: avgScore.length > 0 ? Math.round(avgScore[0].avgScore * 100) / 100 : null
          }
        };
      })
    );

    res.json(agentsWithStats);
  } catch (error) {
    logger.error('Error fetching agents:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Get single agent
// @route   GET /api/qa/agents/:id
// @access  Private
exports.getAgent = async (req, res) => {
  try {
    const userId = req.user._id;
    // Find agent only if it belongs to current user
    const agent = await Agent.findOne({ _id: req.params.id, createdBy: userId });

    if (!agent) {
      return res.status(404).json({ message: 'Agent not found' });
    }

    // Get agent's tickets for current user only
    const tickets = await Ticket.find({
      agent: agent._id,
      isArchived: false,
      createdBy: userId
    }).sort({ dateEntered: -1 });

    res.json({ agent, tickets });
  } catch (error) {
    logger.error('Error fetching agent:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Get agent's unresolved issues (bad grades not yet improved)
// @route   GET /api/qa/agents/:id/issues
// @access  Private
exports.getAgentIssues = async (req, res) => {
  try {
    const agent = await Agent.findById(req.params.id)
      .select('name unresolvedIssues issuesLastAnalyzed');

    if (!agent) {
      return res.status(404).json({ message: 'Agent not found' });
    }

    // Filter to only unresolved issues
    const unresolvedIssues = (agent.unresolvedIssues || [])
      .filter(issue => !issue.isResolved)
      .sort((a, b) => new Date(b.gradedDate) - new Date(a.gradedDate));

    res.json({
      agentName: agent.name,
      issuesLastAnalyzed: agent.issuesLastAnalyzed,
      unresolvedCount: unresolvedIssues.length,
      issues: unresolvedIssues
    });
  } catch (error) {
    logger.error('Error fetching agent issues:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Create new agent (globally unique)
// @route   POST /api/qa/agents
// @access  Private
exports.createAgent = async (req, res) => {
  try {
    const userId = req.user._id;

    // Check if agent with this name already exists
    const existingAgent = await Agent.findOne({
      name: req.body.name.trim()
    });

    if (existingAgent) {
      // Agent exists, add current user to activeForUsers if not already there
      if (!existingAgent.activeForUsers.includes(userId)) {
        existingAgent.activeForUsers.push(userId);
        await existingAgent.save();
        logger.info(`Existing agent added to user's list: ${existingAgent.name} for user ${req.user.email}`);
      }
      return res.status(201).json(existingAgent);
    }

    // Create new agent with current user in activeForUsers
    const agent = await Agent.create({
      ...req.body,
      createdBy: userId,
      activeForUsers: [userId]
    });
    logger.info(`New agent created: ${agent.name} by user ${req.user.email}`);
    res.status(201).json(agent);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: 'An agent with this name already exists' });
    }
    logger.error('Error creating agent:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Update agent
// @route   PUT /api/qa/agents/:id
// @access  Private
exports.updateAgent = async (req, res) => {
  try {
    // Update agent only if it belongs to current user
    const agent = await Agent.findOneAndUpdate(
      { _id: req.params.id, createdBy: req.user._id },
      req.body,
      { new: true, runValidators: true }
    );

    if (!agent) {
      return res.status(404).json({ message: 'Agent not found' });
    }

    logger.info(`Agent updated: ${agent.name} by user ${req.user.email}`);
    res.json(agent);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: 'You already have an agent with this name' });
    }
    logger.error('Error updating agent:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Remove agent from current user's grading list
// @route   DELETE /api/qa/agents/:id
// @access  Private
exports.deleteAgent = async (req, res) => {
  try {
    const userId = req.user._id;
    const agent = await Agent.findById(req.params.id);

    if (!agent) {
      return res.status(404).json({ message: 'Agent not found' });
    }

    // Remove current user from activeForUsers array
    agent.activeForUsers = agent.activeForUsers.filter(
      id => !id.equals(userId)
    );

    await agent.save();
    logger.info(`Agent removed from grading list: ${agent.name} by user ${req.user.email}`);
    res.json({ message: 'Agent removed from your grading list successfully' });
  } catch (error) {
    logger.error('Error removing agent from grading list:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Get all existing agents in the system
// @route   GET /api/qa/agents/all/existing
// @access  Private
exports.getAllExistingAgents = async (req, res) => {
  try {
    // Get all agents, excluding removed ones
    const agents = await Agent.find({ isRemoved: false })
      .select('name position team createdBy activeForUsers')
      .sort({ name: 1 });

    res.json(agents);
  } catch (error) {
    logger.error('Error fetching all existing agents:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Add existing agent to user's grading list
// @route   POST /api/qa/agents/:id/add-to-list
// @access  Private
exports.addExistingAgent = async (req, res) => {
  try {
    const userId = req.user._id;
    const agent = await Agent.findById(req.params.id);

    if (!agent) {
      return res.status(404).json({ message: 'Agent not found' });
    }

    // Add user to activeForUsers if not already there
    if (!agent.activeForUsers.includes(userId)) {
      agent.activeForUsers.push(userId);
      await agent.save();
      logger.info(`Existing agent added to user's list: ${agent.name} for user ${req.user.email}`);
    }

    res.json(agent);
  } catch (error) {
    logger.error('Error adding existing agent:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Get all agents who have tickets (for filters)
// @route   GET /api/qa/agents/with-tickets
// @access  Private
exports.getAgentsWithTickets = async (req, res) => {
  try {
    // Get all agent IDs that have at least one ticket
    const agentsWithTickets = await Ticket.distinct('agent');

    // Get agent details for those IDs
    const agents = await Agent.find({
      _id: { $in: agentsWithTickets }
    })
      .select('name position team')
      .sort({ name: 1 });

    res.json(agents);
  } catch (error) {
    logger.error('Error fetching agents with tickets:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Check for similar agent names (fuzzy search)
// @route   POST /api/qa/agents/check-similar
// @access  Private
exports.checkSimilarAgents = async (req, res) => {
  try {
    const { name } = req.body;

    if (!name || name.trim().length === 0) {
      return res.json({ exists: false, similar: [] });
    }

    const searchName = name.trim().toLowerCase();

    // Check for exact match (case insensitive)
    const exactMatch = await Agent.findOne({
      name: { $regex: new RegExp(`^${searchName}$`, 'i') },
      isRemoved: false
    });

    if (exactMatch) {
      return res.json({
        exists: true,
        exactMatch: true,
        agent: exactMatch
      });
    }

    // Find similar names using regex (contains parts of the name)
    const similarAgents = await Agent.find({
      $or: [
        { name: { $regex: searchName, $options: 'i' } },
        { name: { $regex: searchName.split(' ')[0], $options: 'i' } }
      ],
      isRemoved: false
    }).limit(5);

    res.json({
      exists: false,
      exactMatch: false,
      similar: similarAgents
    });
  } catch (error) {
    logger.error('Error checking similar agents:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// ============================================
// TICKET CONTROLLERS
// ============================================

// @desc    Get all tickets with filters
// @route   GET /api/qa/tickets
// @access  Private
exports.getAllTickets = async (req, res) => {
  try {
    const {
      agent,
      status,
      isArchived,
      dateFrom,
      dateTo,
      scoreMin,
      scoreMax,
      search,
      categories,
      priority,
      tags,
      weekNumber,
      weekYear,
      page = 1,
      limit = 50,
      sortBy = 'dateEntered',
      sortOrder = 'desc'
    } = req.query;

    // Build filter object
    const filter = {};

    // Get createdBy filter (grader) from query params
    const { createdBy: createdByFilter } = req.query;

    // IMPORTANT: If viewing active tickets (not archived), filter by current user
    // If viewing archived tickets, show all tickets (for all QA agents) unless filtered
    if (isArchived !== undefined) {
      filter.isArchived = isArchived === 'true';

      // Only filter by user if viewing active tickets
      if (isArchived === 'false') {
        filter.createdBy = req.user._id;
      } else if (createdByFilter) {
        // For archived tickets, allow filtering by grader (createdBy)
        filter.createdBy = createdByFilter;
      }
    } else {
      // Default: show only active tickets for current user
      filter.isArchived = false;
      filter.createdBy = req.user._id;
    }

    if (agent) {
      filter.agent = agent;
    }

    if (status) {
      filter.status = { $in: status.split(',') };
    }

    if (dateFrom || dateTo) {
      filter.dateEntered = {};
      if (dateFrom) filter.dateEntered.$gte = new Date(dateFrom);
      if (dateTo) filter.dateEntered.$lte = new Date(dateTo);
    }

    // Score range filter - handle both string and number inputs
    const scoreMinNum = scoreMin !== undefined && scoreMin !== '' ? parseFloat(scoreMin) : null;
    const scoreMaxNum = scoreMax !== undefined && scoreMax !== '' ? parseFloat(scoreMax) : null;

    if ((scoreMinNum !== null && !isNaN(scoreMinNum)) || (scoreMaxNum !== null && !isNaN(scoreMaxNum))) {
      filter.qualityScorePercent = {};
      if (scoreMinNum !== null && !isNaN(scoreMinNum)) {
        filter.qualityScorePercent.$gte = scoreMinNum;
      }
      if (scoreMaxNum !== null && !isNaN(scoreMaxNum)) {
        filter.qualityScorePercent.$lte = scoreMaxNum;
      }
    }

    // New filters
    if (categories) {
      // Support filtering by any of the provided categories
      // Handle both array (from URLSearchParams) and comma-separated string
      const categoryList = Array.isArray(categories) ? categories : categories.split(',');
      filter.categories = { $in: categoryList };
    }

    if (priority) {
      filter.priority = { $in: priority.split(',') };
    }

    if (tags) {
      filter.tags = { $in: tags.split(',') };
    }

    if (weekNumber && weekYear) {
      filter.weekNumber = parseInt(weekNumber);
      filter.weekYear = parseInt(weekYear);
    }

    if (search) {
      filter.$or = [
        { ticketId: { $regex: search, $options: 'i' } },
        { shortDescription: { $regex: search, $options: 'i' } },
        { notes: { $regex: search, $options: 'i' } },
        { feedback: { $regex: search, $options: 'i' } },
        { tags: { $regex: search, $options: 'i' } }
      ];
    }

    // Calculate pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Get total count
    const total = await Ticket.countDocuments(filter);

    // Get tickets
    const tickets = await Ticket.find(filter)
      .populate('agent', 'name team position')
      .populate('createdBy', 'name email')
      .sort({ [sortBy]: sortOrder === 'desc' ? -1 : 1 })
      .skip(skip)
      .limit(limitNum);

    res.json({
      tickets,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    logger.error('Error fetching tickets:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Get single ticket
// @route   GET /api/qa/tickets/:id
// @access  Private
exports.getTicket = async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id)
      .populate('agent', 'name team position')
      .populate('createdBy', 'name email');

    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    res.json(ticket);
  } catch (error) {
    logger.error('Error fetching ticket:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Create ticket
// @route   POST /api/qa/tickets
// @access  Private
exports.createTicket = async (req, res) => {
  try {
    // Check if agent exists and is in user's active grading list
    const agent = await Agent.findOne({
      _id: req.body.agent,
      activeForUsers: req.user._id,
      isRemoved: false
    });
    if (!agent) {
      return res.status(400).json({ message: 'Invalid agent ID or agent is not in your grading list' });
    }

    const ticket = await Ticket.create({
      ...req.body,
      createdBy: req.user._id
    });

    const populatedTicket = await Ticket.findById(ticket._id)
      .populate('agent', 'name team position')
      .populate('createdBy', 'name email');

    // Generate AI embeddings in background (don't await to avoid blocking response)
    const ticketIdForEmbed = ticket._id;
    const ticketNotes = populatedTicket.notes;

    // Generate full embedding (notes + feedback)
    generateTicketEmbedding(populatedTicket)
      .then(async (embedding) => {
        if (embedding) {
          const existingTicket = await Ticket.findById(ticketIdForEmbed);
          if (existingTicket) {
            await Ticket.findByIdAndUpdate(ticketIdForEmbed, {
              embedding: embedding,
              embeddingOutdated: false
            });
          }
        }
      })
      .catch(err => {
        if (err.name !== 'VersionError') {
          console.error('Error generating ticket embedding:', err);
        }
      });

    // Generate notes-only embedding for similar feedback search
    if (ticketNotes && ticketNotes.trim().length >= 10) {
      const cleanNotes = ticketNotes.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      generateEmbedding(cleanNotes)
        .then(async (notesEmbedding) => {
          if (notesEmbedding) {
            await Ticket.findByIdAndUpdate(ticketIdForEmbed, { notesEmbedding });
          }
        })
        .catch(err => console.error('Error generating notes embedding:', err));
    }

    logger.info(`Ticket created: ${ticket.ticketId} by user ${req.user.email}`);
    res.status(201).json(populatedTicket);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Ticket with this ID already exists for this agent' });
    }
    logger.error('Error creating ticket:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Update ticket
// @route   PUT /api/qa/tickets/:id
// @access  Private
exports.updateTicket = async (req, res) => {
  try {
    // Debug: Log what categories are being sent
    logger.info(`Update ticket - received categories: ${JSON.stringify(req.body.categories)}`);

    // If agent is being updated, check if it exists and is in user's active grading list
    if (req.body.agent) {
      const agent = await Agent.findOne({
        _id: req.body.agent,
        activeForUsers: req.user._id,
        isRemoved: false
      });
      if (!agent) {
        return res.status(400).json({ message: 'Invalid agent ID or agent is not in your grading list' });
      }
    }

    // Get current ticket to check status change
    const currentTicket = await Ticket.findById(req.params.id);
    if (!currentTicket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    // If status is being changed to 'Graded' and gradedDate is not set, set it now
    if (req.body.status === 'Graded' && currentTicket.status !== 'Graded' && !currentTicket.gradedDate) {
      req.body.gradedDate = new Date();
    }

    // If status is being changed from 'Graded' to 'Selected', clear gradedDate
    if (req.body.status === 'Selected' && currentTicket.status === 'Graded') {
      req.body.gradedDate = null;
    }

    // Log what we're trying to save
    logger.info(`Update ticket - full req.body: ${JSON.stringify(req.body)}`);

    const ticket = await Ticket.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true }
    )
    .populate('agent', 'name team position')
    .populate('createdBy', 'name email');

    // Regenerate embeddings in background whenever ticket is updated
    const ticketIdForEmbed = ticket._id;
    const ticketNotes = ticket.notes;

    // Generate full embedding (notes + feedback)
    generateTicketEmbedding(ticket)
      .then(async (embedding) => {
        if (embedding) {
          await Ticket.findByIdAndUpdate(ticketIdForEmbed, {
            embedding: embedding,
            embeddingOutdated: false
          });
          logger.info(`Embedding regenerated for updated ticket ${ticket.ticketId}`);
        }
      })
      .catch(err => {
        if (err.name !== 'VersionError') {
          logger.error(`Error regenerating embedding for ticket ${ticket.ticketId}:`, err);
        }
      });

    // Regenerate notes-only embedding for similar feedback search
    if (ticketNotes && ticketNotes.trim().length >= 10) {
      const cleanNotes = ticketNotes.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      generateEmbedding(cleanNotes)
        .then(async (notesEmbedding) => {
          if (notesEmbedding) {
            await Ticket.findByIdAndUpdate(ticketIdForEmbed, { notesEmbedding });
          }
        })
        .catch(err => logger.error(`Error generating notes embedding for ticket ${ticket.ticketId}:`, err));
    }

    logger.info(`Ticket updated: ${ticket.ticketId} by user ${req.user.email}`);
    logger.info(`Ticket saved categories: ${JSON.stringify(ticket.categories)}`);
    res.json(ticket);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Ticket with this ID already exists for this agent' });
    }
    logger.error('Error updating ticket:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Delete ticket
// @route   DELETE /api/qa/tickets/:id
// @access  Private
exports.deleteTicket = async (req, res) => {
  try {
    const ticket = await Ticket.findByIdAndDelete(req.params.id);

    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    logger.info(`Ticket deleted: ${ticket.ticketId} by user ${req.user.email}`);
    res.json({ message: 'Ticket deleted successfully' });
  } catch (error) {
    logger.error('Error deleting ticket:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Grade ticket (change status to Graded and set quality score)
// @route   POST /api/qa/tickets/:id/grade
// @access  Private
exports.gradeTicket = async (req, res) => {
  try {
    const { qualityScorePercent } = req.body;

    // Validate quality score
    if (qualityScorePercent === undefined || qualityScorePercent === null) {
      return res.status(400).json({ message: 'Quality score is required' });
    }

    if (qualityScorePercent < 0 || qualityScorePercent > 100) {
      return res.status(400).json({ message: 'Quality score must be between 0 and 100' });
    }

    const ticket = await Ticket.findByIdAndUpdate(
      req.params.id,
      {
        status: 'Graded',
        qualityScorePercent,
        gradedDate: new Date()
      },
      { new: true, runValidators: true }
    )
    .populate('agent', 'name team position')
    .populate('createdBy', 'name email');

    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    logger.info(`Ticket graded: ${ticket.ticketId} with score ${qualityScorePercent}% by user ${req.user.email}`);
    res.json(ticket);
  } catch (error) {
    logger.error('Error grading ticket:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Archive ticket
// @route   POST /api/qa/tickets/:id/archive
// @access  Private
exports.archiveTicket = async (req, res) => {
  try {
    const ticket = await Ticket.findByIdAndUpdate(
      req.params.id,
      {
        isArchived: true,
        archivedDate: new Date()
      },
      { new: true }
    )
    .populate('agent', 'name team position')
    .populate('createdBy', 'name email');

    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    logger.info(`Ticket archived: ${ticket.ticketId} by user ${req.user.email}`);
    res.json(ticket);
  } catch (error) {
    logger.error('Error archiving ticket:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Bulk archive tickets
// @route   POST /api/qa/tickets/bulk-archive
// @access  Private
exports.bulkArchiveTickets = async (req, res) => {
  try {
    const { ticketIds } = req.body;

    if (!Array.isArray(ticketIds) || ticketIds.length === 0) {
      return res.status(400).json({ message: 'Please provide an array of ticket IDs' });
    }

    const result = await Ticket.updateMany(
      { _id: { $in: ticketIds } },
      {
        isArchived: true,
        archivedDate: new Date()
      }
    );

    logger.info(`Bulk archived ${result.modifiedCount} tickets by user ${req.user.email}`);
    res.json({
      message: `Successfully archived ${result.modifiedCount} ticket(s)`,
      count: result.modifiedCount
    });
  } catch (error) {
    logger.error('Error bulk archiving tickets:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Restore ticket from archive
// @route   POST /api/qa/tickets/:id/restore
// @access  Private
exports.restoreTicket = async (req, res) => {
  try {
    const ticket = await Ticket.findByIdAndUpdate(
      req.params.id,
      {
        isArchived: false,
        archivedDate: null
      },
      { new: true }
    )
    .populate('agent', 'name team position')
    .populate('createdBy', 'name email');

    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    logger.info(`Ticket restored: ${ticket.ticketId} by user ${req.user.email}`);
    res.json(ticket);
  } catch (error) {
    logger.error('Error restoring ticket:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// ============================================
// DASHBOARD & ANALYTICS CONTROLLERS
// ============================================

// @desc    Get dashboard statistics
// @route   GET /api/qa/dashboard/stats
// @access  Private
exports.getDashboardStats = async (req, res) => {
  try {
    // Get current user's tickets only (not archived)
    const userId = req.user._id;

    const totalAgents = await Agent.countDocuments({ createdBy: userId });
    const totalTickets = await Ticket.countDocuments({ isArchived: false, createdBy: userId });
    const gradedTickets = await Ticket.countDocuments({ status: 'Graded', isArchived: false, createdBy: userId });
    const selectedTickets = await Ticket.countDocuments({ status: 'Selected', isArchived: false, createdBy: userId });

    // Average quality score for current user's tickets
    const avgScoreResult = await Ticket.aggregate([
      { $match: { isArchived: false, qualityScorePercent: { $ne: null }, createdBy: userId } },
      { $group: { _id: null, avgScore: { $avg: '$qualityScorePercent' } } }
    ]);
    const avgScore = avgScoreResult.length > 0 ? Math.round(avgScoreResult[0].avgScore * 100) / 100 : null;

    // Tickets this week for current user
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay()); // Sunday
    weekStart.setHours(0, 0, 0, 0);

    const ticketsThisWeek = await Ticket.countDocuments({
      dateEntered: { $gte: weekStart },
      isArchived: false,
      createdBy: userId
    });

    // Agent stats for current user's tickets (top performers based on user's evaluations)
    const agentStats = await Ticket.aggregate([
      { $match: { isArchived: false, createdBy: userId } },
      { $group: {
          _id: '$agent',
          ticketCount: { $sum: 1 },
          gradedCount: {
            $sum: { $cond: [{ $eq: ['$status', 'Graded'] }, 1, 0] }
          },
          avgScore: {
            $avg: {
              $cond: [
                { $ne: ['$qualityScorePercent', null] },
                '$qualityScorePercent',
                null
              ]
            }
          }
        }
      },
      { $lookup: {
          from: 'agents',
          localField: '_id',
          foreignField: '_id',
          as: 'agentInfo'
        }
      },
      { $unwind: '$agentInfo' },
      { $project: {
          _id: 0,
          agentId: '$_id',
          agentName: '$agentInfo.name',
          ticketCount: 1,
          gradedCount: 1,
          avgScore: { $round: ['$avgScore', 2] }
        }
      },
      { $sort: { avgScore: -1 } }
    ]);

    res.json({
      totalAgents,
      totalTickets,
      gradedTickets,
      selectedTickets,
      avgScore,
      ticketsThisWeek,
      agentStats,
      avgQualityScore: avgScore // Added for compatibility with frontend
    });
  } catch (error) {
    logger.error('Error fetching dashboard stats:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// ============================================
// EXPORT CONTROLLERS
// ============================================

// @desc    Export Maestro Excel for specific agent
// @route   POST /api/qa/export/maestro/:agentId
// @access  Private
exports.exportMaestro = async (req, res) => {
  try {
    const { agentId } = req.params;
    const { weekStart, weekEnd } = req.body;
    const userId = req.user._id;

    // Verify agent exists
    const agent = await Agent.findById(agentId);
    if (!agent) {
      return res.status(404).json({ message: 'Agent not found' });
    }

    // Get tickets for the agent in the specified week (only current user's tickets)
    // Only export tickets with status 'Selected' (exclude 'Graded' tickets)
    const filter = {
      agent: agentId,
      isArchived: false,
      status: 'Selected',
      createdBy: userId
    };

    if (weekStart && weekEnd) {
      filter.dateEntered = {
        $gte: new Date(weekStart),
        $lte: new Date(weekEnd)
      };
    }

    const tickets = await Ticket.find(filter)
      .select('ticketId')
      .sort({ dateEntered: -1 });

    // Create CSV content - just ticket IDs, one per line
    const csvContent = tickets.map(ticket => ticket.ticketId).join('\n');

    // Generate filename
    const agentNameClean = agent.name.replace(/\s+/g, '_');
    const dateStr = new Date().toISOString().split('T')[0];
    const fileName = `${agentNameClean}_selected_tickets_${dateStr}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');

    // Send CSV content
    res.send(csvContent);

    logger.info(`Maestro export generated: ${fileName} for agent ${agent.name} (${tickets.length} tickets) by user ${req.user.email}`);
  } catch (error) {
    logger.error('Error exporting Maestro:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// ============================================
// AI SEARCH CONTROLLERS
// ============================================

// Helper function to generate ticket embedding
// Prioritizes Notes and Feedback for semantic search (primary content for finding similar tickets)
const generateTicketEmbedding = async (ticket) => {
  try {
    // Primary content - Notes and Feedback are the main searchable content
    const primaryContent = [];
    if (ticket.notes) primaryContent.push(ticket.notes);
    if (ticket.feedback) primaryContent.push(ticket.feedback);

    // Secondary content - provides context but lower weight
    const secondaryContent = [];
    if (ticket.shortDescription) secondaryContent.push(ticket.shortDescription);
    if (ticket.tags && ticket.tags.length > 0) secondaryContent.push(`Tags: ${ticket.tags.join(', ')}`);

    // If no primary content, fall back to secondary
    if (primaryContent.length === 0 && secondaryContent.length === 0) {
      return null;
    }

    // Combine with primary content first (more weight in the embedding)
    // Format: "Primary content... | Context: secondary content"
    let combinedText = primaryContent.join(' ');
    if (secondaryContent.length > 0) {
      combinedText += ' | Context: ' + secondaryContent.join(' ');
    }

    const embedding = await generateEmbedding(combinedText);
    return embedding;
  } catch (error) {
    console.error('Error generating ticket embedding:', error);
    return null;
  }
};

// Helper: Preprocess query for better semantic matching
const preprocessQuery = (query) => {
  // Normalize whitespace and trim
  let processed = query.trim().replace(/\s+/g, ' ');

  // Common abbreviations expansion for QA domain
  const expansions = {
    'wd': 'wrong deposit',
    'wn': 'wrong network',
    'kyc': 'know your customer verification',
    'aml': 'anti money laundering',
    '2fa': 'two factor authentication',
    'tx': 'transaction',
    'txn': 'transaction',
    'addr': 'address',
    'acct': 'account',
    'pwd': 'password',
    'auth': 'authentication'
  };

  // Expand abbreviations (case insensitive)
  Object.entries(expansions).forEach(([abbr, full]) => {
    const regex = new RegExp(`\\b${abbr}\\b`, 'gi');
    processed = processed.replace(regex, full);
  });

  return processed;
};

// Helper: Calculate keyword match score for hybrid search
const calculateKeywordScore = (query, ticket) => {
  const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  if (queryWords.length === 0) return 0;

  const ticketText = [
    ticket.notes || '',
    ticket.feedback || '',
    ticket.shortDescription || ''
  ].join(' ').toLowerCase();

  let matches = 0;
  queryWords.forEach(word => {
    if (ticketText.includes(word)) matches++;
  });

  return (matches / queryWords.length) * 100;
};

// @desc    AI-powered semantic search for tickets using MongoDB Atlas Vector Search
// @route   GET /api/qa/ai-search
// @access  Private
exports.aiSemanticSearch = async (req, res) => {
  try {
    const {
      query,
      isArchived,
      agent,
      status,
      categories,
      priority,
      dateFrom,
      dateTo,
      scoreMin,
      scoreMax,
      limit = 50
    } = req.query;

    if (!query || query.trim().length === 0) {
      return res.json([]);
    }

    // Step 1: Preprocess the query
    const processedQuery = preprocessQuery(query);

    // Step 2: Generate embedding for processed query
    const queryEmbedding = await generateEmbedding(processedQuery);

    if (!queryEmbedding) {
      return res.status(400).json({ message: 'Could not generate query embedding' });
    }

    // Step 3: Build pre-filter for $vectorSearch
    const vectorFilter = {};

    // Archive filter
    if (isArchived !== undefined) {
      vectorFilter.isArchived = isArchived === 'true';
      if (isArchived === 'false') {
        vectorFilter.createdBy = req.user._id;
      }
    } else {
      vectorFilter.isArchived = false;
      vectorFilter.createdBy = req.user._id;
    }

    // Additional filters (only simple equality/in supported by $vectorSearch filter)
    if (agent) vectorFilter.agent = new require('mongoose').Types.ObjectId(agent);
    if (status) vectorFilter.status = { $in: status.split(',') };
    if (categories) {
      const categoryList = Array.isArray(categories) ? categories : categories.split(',');
      vectorFilter.categories = { $in: categoryList };
    }
    if (priority) vectorFilter.priority = { $in: priority.split(',') };

    // Try MongoDB Atlas $vectorSearch first (server-side, memory efficient)
    // Falls back to in-memory search if Atlas Vector Search index doesn't exist
    let results = [];
    let usedVectorSearch = false;

    try {
      // MongoDB Atlas Vector Search - runs on database server, not in Node.js memory
      const vectorSearchPipeline = [
        {
          $vectorSearch: {
            index: 'ticket_embedding_index', // Must be created in Atlas
            path: 'embedding',
            queryVector: queryEmbedding,
            numCandidates: 500, // Candidates to consider (higher = more accurate, slower)
            limit: parseInt(limit) * 2, // Get more to allow for post-filtering
            filter: vectorFilter
          }
        },
        {
          $project: {
            _id: 1,
            ticketId: 1,
            shortDescription: 1,
            notes: 1,
            feedback: 1,
            status: 1,
            dateEntered: 1,
            qualityScorePercent: 1,
            categories: 1,
            priority: 1,
            tags: 1,
            agent: 1,
            createdBy: 1,
            isArchived: 1,
            vectorScore: { $meta: 'vectorSearchScore' }
          }
        },
        // Populate agent
        {
          $lookup: {
            from: 'agents',
            localField: 'agent',
            foreignField: '_id',
            as: 'agentData',
            pipeline: [{ $project: { name: 1, team: 1, position: 1 } }]
          }
        },
        {
          $unwind: { path: '$agentData', preserveNullAndEmptyArrays: true }
        },
        // Populate createdBy
        {
          $lookup: {
            from: 'users',
            localField: 'createdBy',
            foreignField: '_id',
            as: 'createdByData',
            pipeline: [{ $project: { name: 1, email: 1 } }]
          }
        },
        {
          $unwind: { path: '$createdByData', preserveNullAndEmptyArrays: true }
        },
        {
          $project: {
            _id: 1,
            ticketId: 1,
            shortDescription: 1,
            notes: 1,
            feedback: 1,
            status: 1,
            dateEntered: 1,
            qualityScorePercent: 1,
            categories: 1,
            priority: 1,
            tags: 1,
            isArchived: 1,
            agent: '$agentData',
            createdBy: '$createdByData',
            relevanceScore: { $multiply: ['$vectorScore', 100] }
          }
        }
      ];

      // Apply date/score filters after vector search (not supported in $vectorSearch filter)
      if (dateFrom || dateTo || scoreMin !== undefined || scoreMax !== undefined) {
        const matchStage = {};
        if (dateFrom) matchStage.dateEntered = { ...matchStage.dateEntered, $gte: new Date(dateFrom) };
        if (dateTo) matchStage.dateEntered = { ...matchStage.dateEntered, $lte: new Date(dateTo) };
        if (scoreMin !== undefined) matchStage.qualityScorePercent = { ...matchStage.qualityScorePercent, $gte: parseFloat(scoreMin) };
        if (scoreMax !== undefined) matchStage.qualityScorePercent = { ...matchStage.qualityScorePercent, $lte: parseFloat(scoreMax) };
        vectorSearchPipeline.push({ $match: matchStage });
      }

      vectorSearchPipeline.push({ $limit: parseInt(limit) });

      results = await Ticket.aggregate(vectorSearchPipeline);
      usedVectorSearch = true;

      // Round relevance scores
      results = results.map(r => ({
        ...r,
        relevanceScore: Math.round(r.relevanceScore)
      }));

      logger.info(`AI Search (Atlas Vector): query="${query}", results=${results.length}`);

    } catch (vectorSearchError) {
      // If Atlas Vector Search index doesn't exist, fall back to streaming approach
      if (vectorSearchError.codeName === 'InvalidPipelineOperator' ||
          vectorSearchError.message?.includes('$vectorSearch') ||
          vectorSearchError.message?.includes('index not found')) {
        logger.warn('Atlas Vector Search not available, using streaming fallback');
        usedVectorSearch = false;
      } else {
        throw vectorSearchError;
      }
    }

    // Fallback: Stream-based search if Atlas Vector Search is not available
    if (!usedVectorSearch) {
      // Build standard MongoDB filter
      const filter = { embedding: { $exists: true, $ne: null } };

      if (isArchived !== undefined) {
        filter.isArchived = isArchived === 'true';
        if (isArchived === 'false') filter.createdBy = req.user._id;
      } else {
        filter.isArchived = false;
        filter.createdBy = req.user._id;
      }

      if (agent) filter.agent = agent;
      if (status) filter.status = { $in: status.split(',') };
      if (categories) {
        const categoryList = Array.isArray(categories) ? categories : categories.split(',');
        filter.categories = { $in: categoryList };
      }
      if (priority) filter.priority = { $in: priority.split(',') };

      if (dateFrom || dateTo) {
        filter.dateEntered = {};
        if (dateFrom) filter.dateEntered.$gte = new Date(dateFrom);
        if (dateTo) filter.dateEntered.$lte = new Date(dateTo);
      }

      if (scoreMin !== undefined || scoreMax !== undefined) {
        filter.qualityScorePercent = {};
        if (scoreMin !== undefined) filter.qualityScorePercent.$gte = parseFloat(scoreMin);
        if (scoreMax !== undefined) filter.qualityScorePercent.$lte = parseFloat(scoreMax);
      }

      // Use cursor to stream through ALL tickets without loading all into memory
      const cursor = Ticket.find(filter)
        .select('+embedding ticketId shortDescription notes feedback status dateEntered qualityScorePercent categories priority tags agent createdBy isArchived')
        .populate('agent', 'name team position')
        .populate('createdBy', 'name email')
        .cursor();

      // Process tickets in streaming fashion, keeping only top results
      const MAX_RESULTS = parseInt(limit) * 2;
      let processedCount = 0;

      for await (const ticket of cursor) {
        if (!ticket.embedding) continue;
        processedCount++;

        // Calculate similarity score
        const semanticScore = cosineSimilarity(queryEmbedding, ticket.embedding) * 100;
        const keywordScore = calculateKeywordScore(query, ticket);
        const hybridScore = (semanticScore * 0.7) + (keywordScore * 0.3);

        // Only keep results above minimum threshold
        if (hybridScore > 25) {
          results.push({
            _id: ticket._id,
            ticketId: ticket.ticketId,
            shortDescription: ticket.shortDescription,
            notes: ticket.notes,
            feedback: ticket.feedback,
            status: ticket.status,
            dateEntered: ticket.dateEntered,
            qualityScorePercent: ticket.qualityScorePercent,
            categories: ticket.categories,
            priority: ticket.priority,
            tags: ticket.tags,
            agent: ticket.agent,
            createdBy: ticket.createdBy,
            isArchived: ticket.isArchived,
            relevanceScore: Math.round(hybridScore),
            semanticScore: Math.round(semanticScore),
            keywordScore: Math.round(keywordScore)
          });

          // Keep results sorted and limited to prevent memory growth
          if (results.length > MAX_RESULTS) {
            results.sort((a, b) => b.relevanceScore - a.relevanceScore);
            results = results.slice(0, MAX_RESULTS);
          }
        }
      }

      // Final sort
      results.sort((a, b) => b.relevanceScore - a.relevanceScore);
      results = results.slice(0, parseInt(limit));

      logger.info(`AI Search (Streaming): query="${query}", processed="${processedQuery}", ticketsProcessed=${processedCount}, results=${results.length}`);
    }

    res.json(results);
  } catch (error) {
    logger.error('AI search error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Generate embedding for a single ticket
// @route   POST /api/qa/tickets/:id/generate-embedding
// @access  Private
exports.generateTicketEmbeddingEndpoint = async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id)
      .populate('agent', 'name team position');

    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    // Generate embedding
    const embedding = await generateTicketEmbedding(ticket);

    if (embedding) {
      // Use findByIdAndUpdate to avoid version conflicts
      await Ticket.findByIdAndUpdate(ticket._id, {
        embedding: embedding,
        embeddingOutdated: false
      });
      logger.info(`Embedding generated for ticket ${ticket.ticketId} by user ${req.user.email}`);
      return res.json({ message: 'Embedding generated successfully', hasEmbedding: true });
    } else {
      return res.json({ message: 'No content to embed', hasEmbedding: false });
    }
  } catch (error) {
    logger.error('Error generating ticket embedding:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Generate embeddings for all tickets (batch operation)
// @route   POST /api/qa/generate-all-embeddings
// @access  Private
exports.generateAllTicketEmbeddings = async (req, res) => {
  try {
    const { force, includeArchived = true } = req.body;

    // Build query - include all tickets (archived and active) for complete semantic search
    // Only filter by Notes/Feedback content existence for better embeddings
    const query = {};

    // When includeArchived is true, process all tickets for semantic search across archive
    // When false, only process active tickets
    if (!includeArchived) {
      query.isArchived = false;
    }

    if (!force) {
      query.$or = [
        { embedding: null },
        { embedding: { $exists: false } },
        { embeddingOutdated: true }
      ];
    }

    // Only generate embeddings for tickets that have notes or feedback (primary search content)
    query.$and = query.$and || [];
    query.$and.push({
      $or: [
        { notes: { $exists: true, $ne: null, $ne: '' } },
        { feedback: { $exists: true, $ne: null, $ne: '' } }
      ]
    });

    // MEMORY OPTIMIZATION: Get count first and process using cursor
    const totalCount = await Ticket.countDocuments(query);

    // Limit to prevent server crash - process max 200 at a time
    const MAX_BATCH_TOTAL = 200;
    if (totalCount > MAX_BATCH_TOTAL) {
      logger.warn(`Embedding generation limited: ${totalCount} tickets found, processing only ${MAX_BATCH_TOTAL}`);
    }

    let processed = 0;
    let errors = 0;
    let skipped = 0;

    // Process in small batches using cursor to avoid loading all into memory
    const batchSize = 10; // Smaller batch for memory safety
    let batch = [];

    const cursor = Ticket.find(query)
      .select('_id ticketId notes feedback shortDescription tags')
      .populate('agent', 'name team position')
      .limit(MAX_BATCH_TOTAL)
      .cursor();

    for await (const ticket of cursor) {
      batch.push(ticket);

      if (batch.length >= batchSize) {
        // Process batch
        await Promise.all(
          batch.map(async (t) => {
            try {
              const embedding = await generateTicketEmbedding(t);
              if (embedding) {
                await Ticket.findByIdAndUpdate(t._id, {
                  embedding: embedding,
                  embeddingOutdated: false
                });
                processed++;
              } else {
                skipped++;
              }
            } catch (error) {
              if (error.name !== 'VersionError') {
                console.error(`Error processing ticket ${t._id}:`, error);
                errors++;
              }
            }
          })
        );

        // Clear batch and wait to respect rate limits
        batch = [];
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    // Process remaining tickets in batch
    if (batch.length > 0) {
      await Promise.all(
        batch.map(async (t) => {
          try {
            const embedding = await generateTicketEmbedding(t);
            if (embedding) {
              await Ticket.findByIdAndUpdate(t._id, {
                embedding: embedding,
                embeddingOutdated: false
              });
              processed++;
            } else {
              skipped++;
            }
          } catch (error) {
            if (error.name !== 'VersionError') {
              console.error(`Error processing ticket ${t._id}:`, error);
              errors++;
            }
          }
        })
      );
    }

    logger.info(`Batch embedding generation: ${processed} processed, ${skipped} skipped, ${errors} errors by user ${req.user.email}`);

    res.json({
      message: 'Embedding generation complete',
      total: Math.min(totalCount, MAX_BATCH_TOTAL),
      totalInDb: totalCount,
      processed,
      skipped,
      errors
    });
  } catch (error) {
    logger.error('Error generating embeddings:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Get similar feedbacks from graded tickets based on notes
// @route   POST /api/qa/tickets/similar-feedbacks
// @access  Private
//
// HYBRID APPROACH:
// 1. Keyword matching - Find tickets where notes contain similar keywords (fast, no API calls)
// 2. Notes-to-notes embedding - Generate embeddings on-the-fly for notes comparison (accurate)
// Returns up to 10 results combining both methods
exports.getSimilarFeedbacks = async (req, res) => {
  try {
    const { notes, excludeTicketId, limit = 10 } = req.body;

    // Validate notes - need meaningful content
    if (!notes || notes.trim().length < 10) {
      return res.json({ results: [] });
    }

    // Strip HTML tags from notes
    const stripHtml = (html) => {
      if (!html) return '';
      return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    };

    const cleanNotes = stripHtml(notes);

    // Build base filter for graded tickets with feedback
    const baseFilter = {
      status: 'Graded',
      feedback: { $exists: true, $ne: null, $ne: '' },
      notes: { $exists: true, $ne: null, $ne: '' }
    };

    // Exclude current ticket if provided
    if (excludeTicketId) {
      try {
        baseFilter._id = { $ne: new require('mongoose').Types.ObjectId(excludeTicketId) };
      } catch (e) {
        // Invalid ObjectId, ignore
      }
    }

    // ========================================
    // STEP 1: KEYWORD MATCHING (Fast)
    // ========================================

    // Extract meaningful keywords (3+ chars, no common stopwords)
    const stopwords = new Set(['the', 'and', 'for', 'that', 'this', 'with', 'from', 'have', 'was', 'were', 'are', 'been', 'being', 'has', 'had', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'dare', 'ought', 'used', 'also', 'just', 'only', 'even', 'more', 'most', 'other', 'some', 'such', 'than', 'too', 'very', 'own', 'same', 'into', 'over', 'after', 'before', 'between', 'under', 'again', 'further', 'then', 'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all', 'each', 'few', 'many', 'much', 'both', 'any', 'these', 'those', 'what', 'which', 'who', 'whom', 'but', 'not', 'out', 'about', 'because', 'while', 'during', 'through', 'lepo', 'dobro', 'smo', 'mogli', 'nakon', 'koji', 'koja', 'koje', 'tako', 'sto', 'ali', 'vec', 'jos', 'biti', 'bio', 'bila', 'bilo', 'bice']);

    const keywords = cleanNotes
      .toLowerCase()
      .replace(/[^\w\sčćžšđ]/gi, ' ')  // Keep Serbian chars
      .split(/\s+/)
      .filter(w => w.length >= 3 && !stopwords.has(w))
      .slice(0, 15);  // Limit to 15 keywords

    logger.info(`Similar feedbacks: extracted keywords: ${keywords.join(', ')}`);

    let keywordResults = [];

    if (keywords.length > 0) {
      // Build regex pattern for keyword matching in notes
      const keywordPatterns = keywords.map(k => new RegExp(k, 'i'));

      // Find tickets where notes match any keyword
      const keywordCandidates = await Ticket.find({
        ...baseFilter,
        $or: keywordPatterns.map(pattern => ({ notes: pattern }))
      })
        .select('ticketId notes feedback qualityScorePercent categories dateEntered agent')
        .populate('agent', 'name')
        .limit(100)
        .lean();

      // Score by number of keyword matches
      keywordResults = keywordCandidates.map(ticket => {
        const ticketNotesLower = stripHtml(ticket.notes).toLowerCase();
        let matchCount = 0;
        const matchedKeywords = [];

        keywords.forEach(keyword => {
          if (ticketNotesLower.includes(keyword)) {
            matchCount++;
            matchedKeywords.push(keyword);
          }
        });

        // Calculate match percentage
        const matchScore = keywords.length > 0 ? Math.round((matchCount / keywords.length) * 100) : 0;

        return {
          _id: ticket._id,
          ticketId: ticket.ticketId,
          notes: ticket.notes,
          feedback: ticket.feedback,
          qualityScorePercent: ticket.qualityScorePercent,
          categories: ticket.categories,
          dateEntered: ticket.dateEntered,
          agentName: ticket.agent?.name,
          similarityScore: matchScore,
          matchType: 'keyword',
          matchedKeywords
        };
      })
        .filter(t => t.similarityScore >= 20)  // At least 20% keyword match
        .sort((a, b) => b.similarityScore - a.similarityScore)
        .slice(0, 5);  // Top 5 keyword matches

      logger.info(`Similar feedbacks: found ${keywordResults.length} keyword matches`);
    }

    // ========================================
    // STEP 2: NOTES-TO-NOTES EMBEDDING (Using stored notesEmbedding)
    // ========================================
    // Uses pre-computed notesEmbedding field for fast, accurate similarity search

    let embeddingResults = [];

    // Generate embedding for input notes
    const queryEmbedding = await generateEmbedding(cleanNotes);

    if (queryEmbedding) {
      // Get IDs from keyword results to exclude duplicates
      const keywordTicketIds = new Set(keywordResults.map(r => r.ticketId));

      // Find tickets with stored notesEmbedding, excluding keyword matches
      const embeddingCandidates = await Ticket.find({
        ...baseFilter,
        ticketId: { $nin: Array.from(keywordTicketIds) },  // Exclude keyword matches
        notesEmbedding: { $exists: true, $type: 'array', $not: { $size: 0 } }
      })
        .select('+notesEmbedding ticketId notes feedback qualityScorePercent categories dateEntered agent')
        .populate('agent', 'name')
        .limit(200)  // Can handle more since we're using stored embeddings
        .lean();

      // Calculate similarity using stored notesEmbedding
      embeddingResults = embeddingCandidates
        .map(ticket => {
          if (!ticket.notesEmbedding || ticket.notesEmbedding.length === 0) return null;

          // Calculate notes-to-notes similarity using stored embedding
          const similarity = cosineSimilarity(queryEmbedding, ticket.notesEmbedding) * 100;

          return {
            _id: ticket._id,
            ticketId: ticket.ticketId,
            notes: ticket.notes,
            feedback: ticket.feedback,
            qualityScorePercent: ticket.qualityScorePercent,
            categories: ticket.categories,
            dateEntered: ticket.dateEntered,
            agentName: ticket.agent?.name,
            similarityScore: Math.round(similarity),
            matchType: 'embedding'
          };
        })
        .filter(r => r !== null && r.similarityScore >= 25)  // At least 25% similarity
        .sort((a, b) => b.similarityScore - a.similarityScore)
        .slice(0, 5);  // Top 5 embedding matches

      logger.info(`Similar feedbacks: found ${embeddingResults.length} embedding matches (using stored notesEmbedding)`);
    }

    // ========================================
    // STEP 3: COMBINE AND DEDUPLICATE RESULTS
    // ========================================

    // Combine results, prioritizing higher scores
    const allResults = [...keywordResults, ...embeddingResults];

    // Deduplicate by ticket ID, keeping the one with higher score
    const seen = new Map();
    allResults.forEach(r => {
      const key = r.ticketId;
      if (!seen.has(key) || seen.get(key).similarityScore < r.similarityScore) {
        seen.set(key, r);
      }
    });

    // Sort by similarity score and take top results
    const finalResults = Array.from(seen.values())
      .sort((a, b) => b.similarityScore - a.similarityScore)
      .slice(0, parseInt(limit));

    logger.info(`Similar feedbacks: returning ${finalResults.length} combined results`);

    res.json({ results: finalResults });

  } catch (error) {
    logger.error('Error getting similar feedbacks:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// ============================================
// ALL AGENTS MANAGEMENT (Admin Only)
// ============================================

// @desc    Get all agents in system with pagination (Admin only)
// @route   GET /api/qa/all-agents
// @access  Private (Admin)
exports.getAllAgentsAdmin = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      search = '',
      sortBy = 'name',
      sortOrder = 'asc'
    } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Build filter
    const filter = { isRemoved: false };

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { team: { $regex: search, $options: 'i' } },
        { position: { $regex: search, $options: 'i' } }
      ];
    }

    // Build sort
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Get total count
    const total = await Agent.countDocuments(filter);

    // Get paginated agents
    const agents = await Agent.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(limitNum)
      .lean();

    // Get ticket counts for each agent
    const agentsWithStats = await Promise.all(
      agents.map(async (agent) => {
        const ticketCount = await Ticket.countDocuments({ agent: agent._id });
        return {
          ...agent,
          ticketCount
        };
      })
    );

    res.json({
      agents: agentsWithStats,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    logger.error('Error getting all agents:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Update agent (Admin only)
// @route   PUT /api/qa/all-agents/:id
// @access  Private (Admin)
exports.updateAgentAdmin = async (req, res) => {
  try {
    const { name, position, team } = req.body;

    const agent = await Agent.findById(req.params.id);
    if (!agent) {
      return res.status(404).json({ message: 'Agent not found' });
    }

    // Check if new name already exists (for a different agent)
    if (name && name !== agent.name) {
      const existingAgent = await Agent.findOne({ name, _id: { $ne: agent._id } });
      if (existingAgent) {
        return res.status(400).json({ message: 'An agent with this name already exists' });
      }
    }

    // Update fields
    if (name) agent.name = name;
    if (position !== undefined) agent.position = position;
    if (team !== undefined) agent.team = team;

    await agent.save();

    // Get ticket count for response
    const ticketCount = await Ticket.countDocuments({ agent: agent._id });

    logger.info(`Agent updated by admin: ${agent.name} by ${req.user.email}`);

    res.json({
      ...agent.toObject(),
      ticketCount
    });
  } catch (error) {
    logger.error('Error updating agent:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Merge two agents into one (Admin only)
// @route   POST /api/qa/all-agents/merge
// @access  Private (Admin)
exports.mergeAgents = async (req, res) => {
  try {
    const { sourceAgentId, targetAgentId, finalName, finalPosition, finalTeam } = req.body;

    // Validate input
    if (!sourceAgentId || !targetAgentId) {
      return res.status(400).json({ message: 'Both source and target agent IDs are required' });
    }

    if (sourceAgentId === targetAgentId) {
      return res.status(400).json({ message: 'Cannot merge agent with itself' });
    }

    // Get both agents
    const sourceAgent = await Agent.findById(sourceAgentId);
    const targetAgent = await Agent.findById(targetAgentId);

    if (!sourceAgent || !targetAgent) {
      return res.status(404).json({ message: 'One or both agents not found' });
    }

    // Check if final name already exists (for a different agent than target or source)
    // Source will be soft-deleted, so we can use its name too
    if (finalName && finalName !== targetAgent.name && finalName !== sourceAgent.name) {
      const existingAgent = await Agent.findOne({
        name: finalName,
        _id: { $nin: [targetAgentId, sourceAgentId] },
        isRemoved: false
      });
      if (existingAgent) {
        return res.status(400).json({ message: 'An agent with this name already exists' });
      }
    }

    // Count tickets before merge
    const sourceTicketCount = await Ticket.countDocuments({ agent: sourceAgentId });
    const targetTicketCount = await Ticket.countDocuments({ agent: targetAgentId });

    // Find duplicate ticketIds that exist in both agents
    // We need to handle these to avoid unique constraint violation on (ticketId, agent)
    const sourceTickets = await Ticket.find({ agent: sourceAgentId }).select('ticketId').lean();
    const targetTickets = await Ticket.find({ agent: targetAgentId }).select('ticketId').lean();

    const targetTicketIds = new Set(targetTickets.map(t => t.ticketId));
    const duplicateTicketIds = sourceTickets
      .filter(t => targetTicketIds.has(t.ticketId))
      .map(t => t.ticketId);

    // Delete duplicate tickets from source agent (target already has them)
    let duplicatesDeleted = 0;
    if (duplicateTicketIds.length > 0) {
      const deleteResult = await Ticket.deleteMany({
        agent: sourceAgentId,
        ticketId: { $in: duplicateTicketIds }
      });
      duplicatesDeleted = deleteResult.deletedCount;
      logger.info(`Merge: Deleted ${duplicatesDeleted} duplicate tickets from source agent`);
    }

    // Move tickets from source to target agent BEFORE changing names
    // This must happen while source agent still exists
    const updateResult = await Ticket.updateMany(
      { agent: sourceAgentId },
      { $set: { agent: targetAgentId } }
    );

    // Store source agent name for logging before we modify it
    const sourceAgentOriginalName = sourceAgent.name;

    // IMPORTANT: If finalName equals source agent's name, we need to:
    // 1. First rename/remove source agent to free up the name
    // 2. Then update target agent with the final name
    // This avoids unique constraint violation on agent name
    if (finalName && finalName === sourceAgent.name) {
      // Rename source agent temporarily to free up the name
      sourceAgent.name = `__merged_${sourceAgent._id}_${Date.now()}`;
      sourceAgent.isRemoved = true;
      await sourceAgent.save();
    } else {
      // Mark source agent as removed (soft delete)
      sourceAgent.isRemoved = true;
      await sourceAgent.save();
    }

    // Now update target agent with final values (name is now free if it was source's name)
    targetAgent.name = finalName || targetAgent.name;
    targetAgent.position = finalPosition !== undefined ? finalPosition : targetAgent.position;
    targetAgent.team = finalTeam !== undefined ? finalTeam : targetAgent.team;

    // Merge activeForUsers arrays (combine unique users)
    const combinedUsers = [...new Set([
      ...targetAgent.activeForUsers.map(id => id.toString()),
      ...sourceAgent.activeForUsers.map(id => id.toString())
    ])];
    targetAgent.activeForUsers = combinedUsers;

    await targetAgent.save();

    // Get final ticket count
    const finalTicketCount = await Ticket.countDocuments({ agent: targetAgentId });

    logger.info(`Agents merged by admin: "${sourceAgentOriginalName}" -> "${targetAgent.name}" (${updateResult.modifiedCount} tickets moved, ${duplicatesDeleted} duplicates removed) by ${req.user.email}`);

    res.json({
      message: 'Agents merged successfully',
      mergedAgent: {
        ...targetAgent.toObject(),
        ticketCount: finalTicketCount
      },
      stats: {
        sourceTickets: sourceTicketCount,
        targetTickets: targetTicketCount,
        duplicatesDeleted: duplicatesDeleted,
        ticketsMoved: updateResult.modifiedCount,
        totalTickets: finalTicketCount
      }
    });
  } catch (error) {
    logger.error('Error merging agents:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Delete agent permanently (Admin only) - only if no tickets
// @route   DELETE /api/qa/all-agents/:id
// @access  Private (Admin)
exports.deleteAgentAdmin = async (req, res) => {
  try {
    const agent = await Agent.findById(req.params.id);
    if (!agent) {
      return res.status(404).json({ message: 'Agent not found' });
    }

    // Check if agent has any tickets
    const ticketCount = await Ticket.countDocuments({ agent: agent._id });
    if (ticketCount > 0) {
      return res.status(400).json({
        message: `Cannot delete agent with ${ticketCount} tickets. Use merge instead.`
      });
    }

    // Permanently delete agent
    await Agent.findByIdAndDelete(req.params.id);

    logger.info(`Agent deleted by admin: ${agent.name} by ${req.user.email}`);

    res.json({ message: 'Agent deleted successfully' });
  } catch (error) {
    logger.error('Error deleting agent:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// ============================================
// ACTIVE OVERVIEW CONTROLLERS (Admin only - Filip & Nevena)
// ============================================

// QA Grader emails for the overview
const QA_GRADER_EMAILS = [
  'vasilijevitorovic@mebit.io',
  'jovangajic@mebit.io',
  'mladenjovanovic@mebit.io',
  'filipkozomara@mebit.io',
  'nevena@mebit.io',
  'mladenjorganovic@mebit.io'
];

// @desc    Get all active tickets grouped by QA grader and agent (Admin only)
// @route   GET /api/qa/active-overview
// @access  Private (Admin)
exports.getActiveOverview = async (req, res) => {
  try {
    const User = require('../models/User');

    // Get all QA graders
    const qaGraders = await User.find({
      email: { $in: QA_GRADER_EMAILS }
    }).select('_id name email');

    const graderIds = qaGraders.map(g => g._id);

    // Build overview for each grader
    const overview = [];
    let allTickets = [];

    for (const grader of qaGraders) {
      // Find agents that are in this grader's active list (activeForUsers contains grader ID)
      const activeAgents = await Agent.find({
        activeForUsers: grader._id,
        isRemoved: { $ne: true }
      }).select('_id name team position').lean();

      if (activeAgents.length === 0) {
        continue; // Skip graders with no active agents
      }

      const activeAgentIds = activeAgents.map(a => a._id);

      // Find non-archived tickets for these agents created by this grader
      const graderTickets = await Ticket.find({
        isArchived: false,
        createdBy: grader._id,
        agent: { $in: activeAgentIds }
      })
        .populate('agent', 'name team position')
        .populate('createdBy', 'name email')
        .sort({ dateEntered: -1 })
        .lean();

      if (graderTickets.length === 0) {
        // Still show grader if they have active agents but no tickets
        overview.push({
          grader: {
            _id: grader._id,
            name: grader.name,
            email: grader.email
          },
          stats: {
            total: 0,
            graded: 0,
            selected: 0,
            avgScore: 0,
            agentCount: activeAgents.length
          },
          agents: activeAgents.map(agent => ({
            agentId: agent._id.toString(),
            agentName: agent.name,
            agentTeam: agent.team || '',
            agentPosition: agent.position || '',
            tickets: [],
            stats: { total: 0, graded: 0, selected: 0, avgScore: 0 }
          }))
        });
        continue;
      }

      allTickets = allTickets.concat(graderTickets);

      // Group tickets by agent
      const agentGroups = {};

      // Initialize all active agents (even those without tickets)
      activeAgents.forEach(agent => {
        agentGroups[agent._id.toString()] = {
          agentId: agent._id.toString(),
          agentName: agent.name,
          agentTeam: agent.team || '',
          agentPosition: agent.position || '',
          tickets: [],
          stats: {
            total: 0,
            graded: 0,
            selected: 0,
            avgScore: 0,
            totalScore: 0,
            scoredCount: 0
          }
        };
      });

      // Add tickets to their agents
      graderTickets.forEach(ticket => {
        const agentId = ticket.agent?._id?.toString();
        if (agentId && agentGroups[agentId]) {
          agentGroups[agentId].tickets.push(ticket);
          agentGroups[agentId].stats.total++;

          if (ticket.status === 'Graded') {
            agentGroups[agentId].stats.graded++;
          } else {
            agentGroups[agentId].stats.selected++;
          }

          if (ticket.qualityScorePercent !== null && ticket.qualityScorePercent !== undefined) {
            agentGroups[agentId].stats.totalScore += ticket.qualityScorePercent;
            agentGroups[agentId].stats.scoredCount++;
          }
        }
      });

      // Calculate average scores for agents
      Object.values(agentGroups).forEach(group => {
        if (group.stats.scoredCount > 0) {
          group.stats.avgScore = Math.round(group.stats.totalScore / group.stats.scoredCount);
        }
        delete group.stats.totalScore;
        delete group.stats.scoredCount;
      });

      // Calculate grader stats
      const graderStats = {
        total: graderTickets.length,
        graded: graderTickets.filter(t => t.status === 'Graded').length,
        selected: graderTickets.filter(t => t.status === 'Selected').length,
        avgScore: 0,
        agentCount: activeAgents.length
      };

      const scoredTickets = graderTickets.filter(
        t => t.qualityScorePercent !== null && t.qualityScorePercent !== undefined
      );
      if (scoredTickets.length > 0) {
        graderStats.avgScore = Math.round(
          scoredTickets.reduce((sum, t) => sum + t.qualityScorePercent, 0) / scoredTickets.length
        );
      }

      overview.push({
        grader: {
          _id: grader._id,
          name: grader.name,
          email: grader.email
        },
        stats: graderStats,
        agents: Object.values(agentGroups).sort((a, b) => b.stats.total - a.stats.total)
      });
    }

    // Sort graders by total tickets descending
    overview.sort((a, b) => b.stats.total - a.stats.total);

    // Calculate global stats
    const globalStats = {
      totalTickets: allTickets.length,
      totalGraded: allTickets.filter(t => t.status === 'Graded').length,
      totalSelected: allTickets.filter(t => t.status === 'Selected').length,
      totalGraders: overview.filter(g => g.stats.total > 0 || g.stats.agentCount > 0).length,
      avgScore: 0
    };

    const allScoredTickets = allTickets.filter(
      t => t.qualityScorePercent !== null && t.qualityScorePercent !== undefined
    );
    if (allScoredTickets.length > 0) {
      globalStats.avgScore = Math.round(
        allScoredTickets.reduce((sum, t) => sum + t.qualityScorePercent, 0) / allScoredTickets.length
      );
    }

    res.json({
      globalStats,
      graders: overview,
      qaGraderList: qaGraders
    });
  } catch (error) {
    logger.error('Error fetching active overview:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Reassign ticket to another QA grader (Admin only)
// @route   PUT /api/qa/tickets/:id/reassign
// @access  Private (Admin)
exports.reassignTicket = async (req, res) => {
  try {
    const { newGraderId } = req.body;
    const ticketId = req.params.id;

    if (!newGraderId) {
      return res.status(400).json({ message: 'New grader ID is required' });
    }

    const User = require('../models/User');

    // Verify new grader exists and is a valid QA grader
    const newGrader = await User.findById(newGraderId);
    if (!newGrader) {
      return res.status(404).json({ message: 'Grader not found' });
    }

    if (!QA_GRADER_EMAILS.includes(newGrader.email)) {
      return res.status(400).json({ message: 'Target user is not a valid QA grader' });
    }

    // Find and update the ticket
    const ticket = await Ticket.findById(ticketId);
    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    const oldGraderId = ticket.createdBy;
    ticket.createdBy = newGraderId;
    await ticket.save();

    // Populate and return updated ticket
    const updatedTicket = await Ticket.findById(ticketId)
      .populate('agent', 'name team position')
      .populate('createdBy', 'name email');

    logger.info(`Ticket ${ticket.ticketId} reassigned from ${oldGraderId} to ${newGraderId} by ${req.user.email}`);

    res.json({
      message: 'Ticket reassigned successfully',
      ticket: updatedTicket
    });
  } catch (error) {
    logger.error('Error reassigning ticket:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Bulk reassign tickets to another QA grader (Admin only)
// @route   POST /api/qa/tickets/bulk-reassign
// @access  Private (Admin)
exports.bulkReassignTickets = async (req, res) => {
  try {
    const { ticketIds, newGraderId } = req.body;

    if (!ticketIds || !Array.isArray(ticketIds) || ticketIds.length === 0) {
      return res.status(400).json({ message: 'Ticket IDs are required' });
    }

    if (!newGraderId) {
      return res.status(400).json({ message: 'New grader ID is required' });
    }

    const User = require('../models/User');

    // Verify new grader exists and is a valid QA grader
    const newGrader = await User.findById(newGraderId);
    if (!newGrader) {
      return res.status(404).json({ message: 'Grader not found' });
    }

    if (!QA_GRADER_EMAILS.includes(newGrader.email)) {
      return res.status(400).json({ message: 'Target user is not a valid QA grader' });
    }

    // Update all tickets
    const result = await Ticket.updateMany(
      { _id: { $in: ticketIds } },
      { createdBy: newGraderId }
    );

    logger.info(`Bulk reassigned ${result.modifiedCount} tickets to ${newGrader.email} by ${req.user.email}`);

    res.json({
      message: `Successfully reassigned ${result.modifiedCount} tickets`,
      modifiedCount: result.modifiedCount
    });
  } catch (error) {
    logger.error('Error bulk reassigning tickets:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Bulk archive tickets (Admin only - from active overview)
// @route   POST /api/qa/active-overview/bulk-archive
// @access  Private (Admin)
exports.adminBulkArchiveTickets = async (req, res) => {
  try {
    const { ticketIds } = req.body;

    if (!ticketIds || !Array.isArray(ticketIds) || ticketIds.length === 0) {
      return res.status(400).json({ message: 'Ticket IDs are required' });
    }

    const result = await Ticket.updateMany(
      { _id: { $in: ticketIds } },
      {
        isArchived: true,
        archivedDate: new Date()
      }
    );

    logger.info(`Admin bulk archived ${result.modifiedCount} tickets by ${req.user.email}`);

    res.json({
      message: `Successfully archived ${result.modifiedCount} tickets`,
      modifiedCount: result.modifiedCount
    });
  } catch (error) {
    logger.error('Error admin bulk archiving tickets:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Reassign agent from one grader to another (Admin only)
// @route   POST /api/qa/active-overview/reassign-agent
// @access  Private (Admin)
exports.reassignAgentBetweenGraders = async (req, res) => {
  try {
    const { agentId, fromGraderId, toGraderId, moveTickets = true } = req.body;

    if (!agentId || !fromGraderId || !toGraderId) {
      return res.status(400).json({ message: 'Agent ID, source grader ID, and target grader ID are required' });
    }

    const User = require('../models/User');

    // Verify graders exist and are valid
    const [fromGrader, toGrader] = await Promise.all([
      User.findById(fromGraderId),
      User.findById(toGraderId)
    ]);

    if (!fromGrader || !toGrader) {
      return res.status(404).json({ message: 'One or both graders not found' });
    }

    if (!QA_GRADER_EMAILS.includes(fromGrader.email) || !QA_GRADER_EMAILS.includes(toGrader.email)) {
      return res.status(400).json({ message: 'Both users must be valid QA graders' });
    }

    // Get the agent
    const agent = await Agent.findById(agentId);
    if (!agent) {
      return res.status(404).json({ message: 'Agent not found' });
    }

    // Remove from source grader's activeForUsers
    agent.activeForUsers = agent.activeForUsers.filter(
      id => !id.equals(fromGraderId)
    );

    // Add to target grader's activeForUsers (if not already there)
    if (!agent.activeForUsers.some(id => id.equals(toGraderId))) {
      agent.activeForUsers.push(toGraderId);
    }

    await agent.save();

    // Optionally move tickets
    let ticketsMoved = 0;
    if (moveTickets) {
      const result = await Ticket.updateMany(
        { agent: agentId, createdBy: fromGraderId, isArchived: false },
        { createdBy: toGraderId }
      );
      ticketsMoved = result.modifiedCount;
    }

    logger.info(`Agent ${agent.name} reassigned from ${fromGrader.email} to ${toGrader.email} (${ticketsMoved} tickets moved) by ${req.user.email}`);

    res.json({
      message: 'Agent reassigned successfully',
      agent: agent.name,
      ticketsMoved
    });
  } catch (error) {
    logger.error('Error reassigning agent:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Swap agents between two graders (Admin only)
// @route   POST /api/qa/active-overview/swap-agents
// @access  Private (Admin)
exports.swapAgentsBetweenGraders = async (req, res) => {
  try {
    const { agent1Id, grader1Id, agent2Id, grader2Id, moveTickets = true } = req.body;

    if (!agent1Id || !grader1Id || !agent2Id || !grader2Id) {
      return res.status(400).json({ message: 'Both agent IDs and grader IDs are required' });
    }

    const User = require('../models/User');

    // Verify graders
    const [grader1, grader2] = await Promise.all([
      User.findById(grader1Id),
      User.findById(grader2Id)
    ]);

    if (!grader1 || !grader2) {
      return res.status(404).json({ message: 'One or both graders not found' });
    }

    // Get agents
    const [agent1, agent2] = await Promise.all([
      Agent.findById(agent1Id),
      Agent.findById(agent2Id)
    ]);

    if (!agent1 || !agent2) {
      return res.status(404).json({ message: 'One or both agents not found' });
    }

    // Swap agent1: remove from grader1, add to grader2
    agent1.activeForUsers = agent1.activeForUsers.filter(id => !id.equals(grader1Id));
    if (!agent1.activeForUsers.some(id => id.equals(grader2Id))) {
      agent1.activeForUsers.push(grader2Id);
    }

    // Swap agent2: remove from grader2, add to grader1
    agent2.activeForUsers = agent2.activeForUsers.filter(id => !id.equals(grader2Id));
    if (!agent2.activeForUsers.some(id => id.equals(grader1Id))) {
      agent2.activeForUsers.push(grader1Id);
    }

    await Promise.all([agent1.save(), agent2.save()]);

    // Move tickets if requested
    let tickets1Moved = 0, tickets2Moved = 0;
    if (moveTickets) {
      const [result1, result2] = await Promise.all([
        Ticket.updateMany(
          { agent: agent1Id, createdBy: grader1Id, isArchived: false },
          { createdBy: grader2Id }
        ),
        Ticket.updateMany(
          { agent: agent2Id, createdBy: grader2Id, isArchived: false },
          { createdBy: grader1Id }
        )
      ]);
      tickets1Moved = result1.modifiedCount;
      tickets2Moved = result2.modifiedCount;
    }

    logger.info(`Agents swapped: ${agent1.name} <-> ${agent2.name} between ${grader1.email} and ${grader2.email} by ${req.user.email}`);

    res.json({
      message: 'Agents swapped successfully',
      swap: {
        agent1: { name: agent1.name, ticketsMoved: tickets1Moved },
        agent2: { name: agent2.name, ticketsMoved: tickets2Moved }
      }
    });
  } catch (error) {
    logger.error('Error swapping agents:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Archive all tickets for a specific grader (Admin only)
// @route   POST /api/qa/active-overview/archive-grader-tickets
// @access  Private (Admin)
exports.archiveAllForGrader = async (req, res) => {
  try {
    const { graderId } = req.body;

    if (!graderId) {
      return res.status(400).json({ message: 'Grader ID is required' });
    }

    const User = require('../models/User');
    const grader = await User.findById(graderId);

    if (!grader) {
      return res.status(404).json({ message: 'Grader not found' });
    }

    const result = await Ticket.updateMany(
      { createdBy: graderId, isArchived: false },
      { isArchived: true, archivedDate: new Date() }
    );

    logger.info(`Archived all ${result.modifiedCount} tickets for ${grader.email} by ${req.user.email}`);

    res.json({
      message: `Successfully archived ${result.modifiedCount} tickets for ${grader.name}`,
      archivedCount: result.modifiedCount
    });
  } catch (error) {
    logger.error('Error archiving grader tickets:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Get grading velocity (tickets graded per day) (Admin only)
// @route   GET /api/qa/active-overview/velocity
// @access  Private (Admin)
exports.getGradingVelocity = async (req, res) => {
  try {
    const { days = 14 } = req.query;
    const User = require('../models/User');

    // Get QA graders
    const qaGraders = await User.find({
      email: { $in: QA_GRADER_EMAILS }
    }).select('_id name email');

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));
    startDate.setHours(0, 0, 0, 0);

    // Get velocity data for each grader
    const velocityData = [];

    for (const grader of qaGraders) {
      // Get daily grading counts
      const dailyCounts = await Ticket.aggregate([
        {
          $match: {
            createdBy: grader._id,
            status: 'Graded',
            gradedDate: { $gte: startDate }
          }
        },
        {
          $group: {
            _id: {
              $dateToString: { format: '%Y-%m-%d', date: '$gradedDate' }
            },
            count: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ]);

      // Fill in missing days with 0
      const dailyData = [];
      const today = new Date();
      for (let d = new Date(startDate); d <= today; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split('T')[0];
        const found = dailyCounts.find(c => c._id === dateStr);
        dailyData.push({
          date: dateStr,
          count: found ? found.count : 0
        });
      }

      // Calculate average
      const totalGraded = dailyData.reduce((sum, d) => sum + d.count, 0);
      const avgPerDay = dailyData.length > 0 ? (totalGraded / dailyData.length).toFixed(1) : 0;

      velocityData.push({
        grader: {
          _id: grader._id,
          name: grader.name,
          email: grader.email
        },
        dailyData,
        stats: {
          totalGraded,
          avgPerDay: parseFloat(avgPerDay),
          activeDays: dailyData.filter(d => d.count > 0).length
        }
      });
    }

    res.json({
      period: { start: startDate, end: new Date(), days: parseInt(days) },
      graders: velocityData
    });
  } catch (error) {
    logger.error('Error getting grading velocity:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Get agent evaluation history (who evaluated this agent in past weeks) (Admin only)
// @route   GET /api/qa/active-overview/agent-history/:agentId
// @access  Private (Admin)
exports.getAgentHistory = async (req, res) => {
  try {
    const { agentId } = req.params;
    const { weeks = 8 } = req.query;
    const User = require('../models/User');

    const agent = await Agent.findById(agentId);
    if (!agent) {
      return res.status(404).json({ message: 'Agent not found' });
    }

    // Get all tickets for this agent grouped by week and grader
    const weeksAgo = new Date();
    weeksAgo.setDate(weeksAgo.getDate() - (parseInt(weeks) * 7));

    const history = await Ticket.aggregate([
      {
        $match: {
          agent: agent._id,
          dateEntered: { $gte: weeksAgo }
        }
      },
      {
        $group: {
          _id: {
            grader: '$createdBy',
            week: { $week: '$dateEntered' },
            year: { $year: '$dateEntered' }
          },
          ticketCount: { $sum: 1 },
          gradedCount: {
            $sum: { $cond: [{ $eq: ['$status', 'Graded'] }, 1, 0] }
          },
          avgScore: {
            $avg: {
              $cond: [
                { $ne: ['$qualityScorePercent', null] },
                '$qualityScorePercent',
                null
              ]
            }
          }
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id.grader',
          foreignField: '_id',
          as: 'graderInfo'
        }
      },
      { $unwind: '$graderInfo' },
      {
        $project: {
          week: '$_id.week',
          year: '$_id.year',
          grader: {
            _id: '$graderInfo._id',
            name: '$graderInfo.name',
            email: '$graderInfo.email'
          },
          ticketCount: 1,
          gradedCount: 1,
          avgScore: { $round: ['$avgScore', 1] }
        }
      },
      { $sort: { year: -1, week: -1 } }
    ]);

    res.json({
      agent: { _id: agent._id, name: agent.name },
      history,
      currentGraders: agent.activeForUsers
    });
  } catch (error) {
    logger.error('Error getting agent history:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Vacation mode - redistribute agents from one grader to others (Admin only)
// @route   POST /api/qa/active-overview/vacation-mode
// @access  Private (Admin)
exports.vacationModeRedistribute = async (req, res) => {
  try {
    const { graderId, archiveTickets = true } = req.body;

    if (!graderId) {
      return res.status(400).json({ message: 'Grader ID is required' });
    }

    const User = require('../models/User');

    // Get the grader going on vacation
    const vacationGrader = await User.findById(graderId);
    if (!vacationGrader) {
      return res.status(404).json({ message: 'Grader not found' });
    }

    // Get other active graders (exclude vacation grader)
    const otherGraders = await User.find({
      email: { $in: QA_GRADER_EMAILS.filter(e => e !== vacationGrader.email) }
    }).select('_id name email');

    if (otherGraders.length === 0) {
      return res.status(400).json({ message: 'No other graders available for redistribution' });
    }

    // Get agents assigned to vacation grader
    const agents = await Agent.find({
      activeForUsers: graderId,
      isRemoved: { $ne: true }
    });

    if (agents.length === 0) {
      return res.status(400).json({ message: 'Grader has no agents to redistribute' });
    }

    // Get current workload (agent count) for each grader
    const workloads = await Promise.all(
      otherGraders.map(async (grader) => {
        const count = await Agent.countDocuments({
          activeForUsers: grader._id,
          isRemoved: { $ne: true }
        });
        return { grader, count };
      })
    );

    // Sort by workload (ascending) to distribute to least loaded first
    workloads.sort((a, b) => a.count - b.count);

    // Redistribute agents round-robin style to balance workload
    const redistribution = [];
    let graderIndex = 0;

    for (const agent of agents) {
      const targetGrader = workloads[graderIndex].grader;

      // Remove from vacation grader
      agent.activeForUsers = agent.activeForUsers.filter(
        id => !id.equals(graderId)
      );

      // Add to target grader
      if (!agent.activeForUsers.some(id => id.equals(targetGrader._id))) {
        agent.activeForUsers.push(targetGrader._id);
      }

      await agent.save();

      redistribution.push({
        agent: agent.name,
        assignedTo: targetGrader.name
      });

      // Update workload count and resort
      workloads[graderIndex].count++;
      workloads.sort((a, b) => a.count - b.count);
      graderIndex = 0; // Always assign to least loaded
    }

    // Archive tickets if requested
    let archivedCount = 0;
    if (archiveTickets) {
      const result = await Ticket.updateMany(
        { createdBy: graderId, isArchived: false },
        { isArchived: true, archivedDate: new Date() }
      );
      archivedCount = result.modifiedCount;
    }

    logger.info(`Vacation mode activated for ${vacationGrader.email}: ${agents.length} agents redistributed, ${archivedCount} tickets archived by ${req.user.email}`);

    res.json({
      message: `Vacation mode activated for ${vacationGrader.name}`,
      agentsRedistributed: redistribution,
      ticketsArchived: archivedCount
    });
  } catch (error) {
    logger.error('Error in vacation mode:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Get week setup data (current agent assignments) (Admin only)
// @route   GET /api/qa/active-overview/week-setup
// @access  Private (Admin)
exports.getWeekSetup = async (req, res) => {
  try {
    const User = require('../models/User');

    // Get all QA graders
    const qaGraders = await User.find({
      email: { $in: QA_GRADER_EMAILS }
    }).select('_id name email');

    // Get all non-removed agents
    const allAgents = await Agent.find({ isRemoved: { $ne: true } })
      .select('_id name team position activeForUsers')
      .sort({ name: 1 });

    // Build setup for each grader
    const setup = [];

    for (const grader of qaGraders) {
      const assignedAgents = allAgents.filter(agent =>
        agent.activeForUsers.some(id => id.equals(grader._id))
      );

      setup.push({
        grader: {
          _id: grader._id,
          name: grader.name,
          email: grader.email
        },
        agents: assignedAgents.map(a => ({
          _id: a._id,
          name: a.name,
          team: a.team,
          position: a.position
        }))
      });
    }

    // Get unassigned agents (not in any grader's list)
    const unassignedAgents = allAgents.filter(agent =>
      !agent.activeForUsers.some(id =>
        qaGraders.some(g => g._id.equals(id))
      )
    );

    res.json({
      setup,
      unassignedAgents: unassignedAgents.map(a => ({
        _id: a._id,
        name: a.name,
        team: a.team,
        position: a.position
      })),
      allAgents: allAgents.map(a => ({
        _id: a._id,
        name: a.name,
        team: a.team,
        position: a.position
      }))
    });
  } catch (error) {
    logger.error('Error getting week setup:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Save week setup (update agent assignments) (Admin only)
// @route   POST /api/qa/active-overview/week-setup
// @access  Private (Admin)
exports.saveWeekSetup = async (req, res) => {
  try {
    const { assignments } = req.body;

    if (!assignments || !Array.isArray(assignments)) {
      return res.status(400).json({ message: 'Assignments array is required' });
    }

    const User = require('../models/User');

    // Get QA grader IDs
    const qaGraders = await User.find({
      email: { $in: QA_GRADER_EMAILS }
    }).select('_id email');

    const graderIds = qaGraders.map(g => g._id);

    // Clear all current assignments for QA graders
    await Agent.updateMany(
      { isRemoved: { $ne: true } },
      { $pull: { activeForUsers: { $in: graderIds } } }
    );

    // Apply new assignments
    for (const assignment of assignments) {
      const { graderId, agentIds } = assignment;

      if (!graderId || !agentIds || !Array.isArray(agentIds)) continue;

      // Verify grader is valid
      if (!graderIds.some(id => id.equals(graderId))) continue;

      // Add grader to each agent's activeForUsers
      await Agent.updateMany(
        { _id: { $in: agentIds }, isRemoved: { $ne: true } },
        { $addToSet: { activeForUsers: graderId } }
      );
    }

    logger.info(`Week setup saved by ${req.user.email}`);

    res.json({ message: 'Week setup saved successfully' });
  } catch (error) {
    logger.error('Error saving week setup:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Copy last week's setup (Admin only)
// @route   POST /api/qa/active-overview/copy-last-week
// @access  Private (Admin)
exports.copyLastWeekSetup = async (req, res) => {
  try {
    const User = require('../models/User');

    // Get the start of last week (Monday)
    const today = new Date();
    const dayOfWeek = today.getDay();
    const lastWeekStart = new Date(today);
    lastWeekStart.setDate(today.getDate() - dayOfWeek - 7 + 1); // Last Monday
    lastWeekStart.setHours(0, 0, 0, 0);

    const lastWeekEnd = new Date(lastWeekStart);
    lastWeekEnd.setDate(lastWeekStart.getDate() + 6); // Last Sunday
    lastWeekEnd.setHours(23, 59, 59, 999);

    // Find which agents each grader was evaluating last week based on ticket data
    const qaGraders = await User.find({
      email: { $in: QA_GRADER_EMAILS }
    }).select('_id name email');

    const lastWeekSetup = [];

    for (const grader of qaGraders) {
      // Find distinct agents this grader evaluated last week
      const agentIds = await Ticket.distinct('agent', {
        createdBy: grader._id,
        dateEntered: { $gte: lastWeekStart, $lte: lastWeekEnd }
      });

      const agents = await Agent.find({
        _id: { $in: agentIds },
        isRemoved: { $ne: true }
      }).select('_id name team position');

      lastWeekSetup.push({
        grader: {
          _id: grader._id,
          name: grader.name,
          email: grader.email
        },
        agents: agents.map(a => ({
          _id: a._id,
          name: a.name,
          team: a.team,
          position: a.position
        }))
      });
    }

    res.json({
      lastWeekPeriod: { start: lastWeekStart, end: lastWeekEnd },
      setup: lastWeekSetup
    });
  } catch (error) {
    logger.error('Error copying last week setup:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Get stale tickets (tickets not graded within X days) (Admin only)
// @route   GET /api/qa/active-overview/stale-tickets
// @access  Private (Admin)
exports.getStaleTickets = async (req, res) => {
  try {
    const { days = 5 } = req.query;
    const User = require('../models/User');

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - parseInt(days));

    // Find tickets older than X days that are still not graded
    const staleTickets = await Ticket.find({
      isArchived: false,
      status: 'Selected',
      dateEntered: { $lt: cutoffDate }
    })
      .populate('agent', 'name team')
      .populate('createdBy', 'name email')
      .sort({ dateEntered: 1 })
      .lean();

    // Group by grader
    const groupedByGrader = {};
    const graders = await User.find({
      email: { $in: QA_GRADER_EMAILS }
    }).select('_id name email');

    graders.forEach(g => {
      groupedByGrader[g._id.toString()] = {
        grader: { _id: g._id, name: g.name, email: g.email },
        tickets: []
      };
    });

    staleTickets.forEach(ticket => {
      const graderId = ticket.createdBy?._id?.toString();
      if (graderId && groupedByGrader[graderId]) {
        const daysOld = Math.floor((new Date() - new Date(ticket.dateEntered)) / (1000 * 60 * 60 * 24));
        groupedByGrader[graderId].tickets.push({
          ...ticket,
          daysOld
        });
      }
    });

    res.json({
      threshold: parseInt(days),
      totalStale: staleTickets.length,
      byGrader: Object.values(groupedByGrader).filter(g => g.tickets.length > 0)
    });
  } catch (error) {
    logger.error('Error getting stale tickets:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Get score comparison between graders (Admin only)
// @route   GET /api/qa/active-overview/score-comparison
// @access  Private (Admin)
exports.getScoreComparison = async (req, res) => {
  try {
    const { weeks = 4 } = req.query;
    const User = require('../models/User');

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - (parseInt(weeks) * 7));

    const qaGraders = await User.find({
      email: { $in: QA_GRADER_EMAILS }
    }).select('_id name email');

    const comparison = [];

    for (const grader of qaGraders) {
      const stats = await Ticket.aggregate([
        {
          $match: {
            createdBy: grader._id,
            status: 'Graded',
            qualityScorePercent: { $ne: null },
            gradedDate: { $gte: startDate }
          }
        },
        {
          $group: {
            _id: null,
            avgScore: { $avg: '$qualityScorePercent' },
            minScore: { $min: '$qualityScorePercent' },
            maxScore: { $max: '$qualityScorePercent' },
            stdDev: { $stdDevPop: '$qualityScorePercent' },
            count: { $sum: 1 },
            scoreDistribution: {
              $push: '$qualityScorePercent'
            }
          }
        }
      ]);

      if (stats.length > 0) {
        const s = stats[0];
        // Calculate score buckets
        const buckets = {
          excellent: s.scoreDistribution.filter(score => score >= 90).length,
          good: s.scoreDistribution.filter(score => score >= 70 && score < 90).length,
          average: s.scoreDistribution.filter(score => score >= 50 && score < 70).length,
          poor: s.scoreDistribution.filter(score => score < 50).length
        };

        comparison.push({
          grader: { _id: grader._id, name: grader.name, email: grader.email },
          stats: {
            avgScore: Math.round(s.avgScore * 10) / 10,
            minScore: s.minScore,
            maxScore: s.maxScore,
            stdDev: Math.round(s.stdDev * 10) / 10,
            ticketsGraded: s.count,
            buckets
          }
        });
      } else {
        comparison.push({
          grader: { _id: grader._id, name: grader.name, email: grader.email },
          stats: {
            avgScore: 0,
            minScore: 0,
            maxScore: 0,
            stdDev: 0,
            ticketsGraded: 0,
            buckets: { excellent: 0, good: 0, average: 0, poor: 0 }
          }
        });
      }
    }

    // Calculate overall average for comparison
    const overallAvg = comparison.length > 0
      ? comparison.reduce((sum, c) => sum + c.stats.avgScore, 0) / comparison.filter(c => c.stats.ticketsGraded > 0).length
      : 0;

    res.json({
      period: { weeks: parseInt(weeks), startDate },
      overallAvg: Math.round(overallAvg * 10) / 10,
      comparison: comparison.sort((a, b) => b.stats.avgScore - a.stats.avgScore)
    });
  } catch (error) {
    logger.error('Error getting score comparison:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Parse Excel file to extract agent assignments for a specific week
// @route   POST /api/qa/active-overview/import-excel
// @access  Private (Admin only)
exports.parseExcelAssignments = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const { targetWeek } = req.body; // Optional: specify which week to extract (e.g., "12 - 18")

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(req.file.buffer);

    // Get current date to find the right month sheet
    const now = new Date();
    const currentMonth = now.toLocaleString('en-US', { month: 'long' });
    const currentYear = now.getFullYear();

    // Find the appropriate sheet (try current month first)
    let targetSheet = null;
    for (const sheet of workbook.worksheets) {
      const sheetName = sheet.name.toLowerCase();
      // Match patterns like "January 2026", "QA Log | January 2026", etc.
      if (sheetName.includes(currentMonth.toLowerCase()) && sheetName.includes(currentYear.toString())) {
        targetSheet = sheet;
        break;
      }
      // Also try just the month name
      if (sheetName.includes(currentMonth.toLowerCase())) {
        targetSheet = sheet;
        break;
      }
    }

    // If no match, use the last sheet (most recent)
    if (!targetSheet && workbook.worksheets.length > 0) {
      targetSheet = workbook.worksheets[workbook.worksheets.length - 1];
    }

    if (!targetSheet) {
      return res.status(400).json({ message: 'No valid worksheet found in Excel file' });
    }

    // Parse the sheet to find weeks and their agent assignments
    const weeks = [];
    let currentWeekData = null;

    // Keywords to skip (not agent names)
    const skipKeywords = [
      'agents assigned', 'scoreboard', 'goal', 'position', 'team',
      'manual', 'maestro', 'total', 'average', 'sum', 'number of evaluations',
      'qa log', 'maestro tracker', 'weeks'
    ];

    // Week header patterns
    const weekPattern = /^(\d{1,2}\s*-\s*\d{1,2})$|^([A-Za-z]+\s+\d{1,2}\s*-\s*\d{1,2})$/;

    // Month names for detecting month-only headers
    const monthNames = ['january', 'february', 'march', 'april', 'may', 'june',
                        'july', 'august', 'september', 'october', 'november', 'december'];

    targetSheet.eachRow({ includeEmpty: false }, (row, rowIndex) => {
      const cells = row.values.slice(1); // Skip first empty cell (Excel is 1-indexed)

      // Find column B value (index 1)
      const cellB = cells[1]?.toString().trim() || '';
      const cellBLower = cellB.toLowerCase();

      // Skip empty cells
      if (!cellB) return;

      // Check if this is a week header (date range like "12 - 18" or "January 5 - 11")
      if (weekPattern.test(cellB)) {
        // Save previous week if exists
        if (currentWeekData) {
          weeks.push(currentWeekData);
        }
        currentWeekData = {
          weekRange: cellB,
          rowIndex,
          agents: []
        };
        return;
      }

      // Skip header rows and other non-agent rows
      if (skipKeywords.some(kw => cellBLower.includes(kw))) {
        return;
      }

      // Skip month-only headers
      if (monthNames.some(m => cellBLower === m)) {
        return;
      }

      // If we're in a week block, check if this looks like an agent name
      if (currentWeekData) {
        const agentName = cellB;

        // Agent names typically:
        // - Have at least 2 characters
        // - Contain letters (not just numbers)
        // - Have additional data in other columns (scoreboard, position, team)
        const hasLetters = /[a-zA-Z]/.test(agentName);
        const hasOtherData = cells[2] || cells[3] || cells[4] || cells[5];

        if (agentName.length >= 2 && hasLetters && hasOtherData) {
          const scoreboard = cells[2]?.toString().trim() || '';
          const goal = cells[3]?.toString().trim() || '';
          const position = cells[4]?.toString().trim() || '';
          const team = cells[5]?.toString().trim() || '';

          // Additional validation: position or team should look valid
          const validPositions = ['junior', 'medior', 'senior', 'specialist', 'french', 'turkish', 'german', 'spanish'];
          const looksLikeAgent = validPositions.some(p => position.toLowerCase().includes(p)) ||
                                 team.toLowerCase().includes('bg') ||
                                 team.toLowerCase().includes('international') ||
                                 scoreboard.toLowerCase().includes('scoreboard');

          if (looksLikeAgent) {
            currentWeekData.agents.push({
              name: agentName,
              scoreboard,
              goal,
              position,
              team
            });
          }
        }
      }
    });

    // Don't forget the last week
    if (currentWeekData) {
      weeks.push(currentWeekData);
    }

    // Find the target week's agents
    let selectedWeek = null;
    if (targetWeek) {
      // User specified a week
      selectedWeek = weeks.find(w => w.weekRange.includes(targetWeek));
    } else {
      // Get the most recent week (last one in the list)
      selectedWeek = weeks[weeks.length - 1];
    }

    if (!selectedWeek) {
      return res.status(404).json({
        message: 'No week data found',
        availableWeeks: weeks.map(w => w.weekRange)
      });
    }

    // Try to match agent names with database agents
    const agentNames = selectedWeek.agents.map(a => a.name);
    const matchedAgents = [];
    const unmatchedAgents = [];

    for (const excelAgent of selectedWeek.agents) {
      // Try to find matching agent in database (case-insensitive)
      const dbAgent = await Agent.findOne({
        name: { $regex: new RegExp(`^${excelAgent.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
        isRemoved: false
      }).select('_id name team');

      if (dbAgent) {
        matchedAgents.push({
          excelName: excelAgent.name,
          dbAgent: {
            _id: dbAgent._id,
            name: dbAgent.name,
            team: dbAgent.team || excelAgent.team
          },
          position: excelAgent.position,
          team: excelAgent.team
        });
      } else {
        unmatchedAgents.push({
          name: excelAgent.name,
          position: excelAgent.position,
          team: excelAgent.team
        });
      }
    }

    res.json({
      sheetName: targetSheet.name,
      weekRange: selectedWeek.weekRange,
      totalAgentsInExcel: selectedWeek.agents.length,
      matchedAgents,
      unmatchedAgents,
      availableWeeks: weeks.map(w => ({ weekRange: w.weekRange, agentCount: w.agents.length }))
    });
  } catch (error) {
    logger.error('Error parsing Excel file:', error);
    res.status(500).json({ message: 'Error parsing Excel file: ' + error.message });
  }
};
