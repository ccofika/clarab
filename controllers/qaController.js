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
      category,
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

    // IMPORTANT: If viewing active tickets (not archived), filter by current user
    // If viewing archived tickets, show all tickets (for all QA agents)
    if (isArchived !== undefined) {
      filter.isArchived = isArchived === 'true';

      // Only filter by user if viewing active tickets
      if (isArchived === 'false') {
        filter.createdBy = req.user._id;
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

    if (scoreMin !== undefined || scoreMax !== undefined) {
      filter.qualityScorePercent = {};
      if (scoreMin !== undefined) filter.qualityScorePercent.$gte = parseFloat(scoreMin);
      if (scoreMax !== undefined) filter.qualityScorePercent.$lte = parseFloat(scoreMax);
    }

    // New filters
    if (category) {
      filter.category = { $in: category.split(',') };
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

    // Generate AI embedding in background (don't await to avoid blocking response)
    const ticketId = ticket._id;
    generateTicketEmbedding(populatedTicket)
      .then(async (embedding) => {
        if (embedding) {
          // Re-fetch ticket to check if it still exists and avoid version conflicts
          const existingTicket = await Ticket.findById(ticketId);
          if (existingTicket) {
            // Use findByIdAndUpdate to avoid version conflicts
            await Ticket.findByIdAndUpdate(ticketId, {
              embedding: embedding,
              embeddingOutdated: false
            });
          }
        }
      })
      .catch(err => {
        // Only log if it's not a version error from a deleted document
        if (err.name !== 'VersionError') {
          console.error('Error generating ticket embedding:', err);
        }
      });

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

    const ticket = await Ticket.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    )
    .populate('agent', 'name team position')
    .populate('createdBy', 'name email');

    // Regenerate embedding in background whenever ticket is updated
    // This ensures AI search always has up-to-date embeddings
    const ticketId = ticket._id;
    generateTicketEmbedding(ticket)
      .then(async (embedding) => {
        if (embedding) {
          await Ticket.findByIdAndUpdate(ticketId, {
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

    logger.info(`Ticket updated: ${ticket.ticketId} by user ${req.user.email}`);
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

    // Format dates for filename
    const formatDate = (dateString) => {
      const date = new Date(dateString);
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = date.getFullYear();
      return `${day}.${month}.${year}`;
    };

    const dateFromFormatted = weekStart ? formatDate(weekStart) : '';
    const dateToFormatted = weekEnd ? formatDate(weekEnd) : '';
    const agentNameClean = agent.name.replace(/\s+/g, '_');

    const fileName = `${agentNameClean}_${dateFromFormatted}_${dateToFormatted}.csv`;
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
      category,
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
    if (category) vectorFilter.category = { $in: category.split(',') };
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
            category: 1,
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
            category: 1,
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
      if (category) filter.category = { $in: category.split(',') };
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
        .select('+embedding ticketId shortDescription notes feedback status dateEntered qualityScorePercent category priority tags agent createdBy isArchived')
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
            category: ticket.category,
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
