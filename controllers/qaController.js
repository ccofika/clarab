const Agent = require('../models/Agent');
const Ticket = require('../models/Ticket');
const logger = require('../utils/logger');
const ExcelJS = require('exceljs');

// ============================================
// AGENT CONTROLLERS
// ============================================

// @desc    Get all agents
// @route   GET /api/qa/agents
// @access  Private
exports.getAllAgents = async (req, res) => {
  try {
    const userId = req.user._id;
    // Filter agents by current user
    const agents = await Agent.find({ createdBy: userId }).sort({ name: 1 });

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

// @desc    Create agent
// @route   POST /api/qa/agents
// @access  Private
exports.createAgent = async (req, res) => {
  try {
    const agent = await Agent.create({
      ...req.body,
      createdBy: req.user._id
    });
    logger.info(`Agent created: ${agent.name} by user ${req.user.email}`);
    res.status(201).json(agent);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: 'You already have an agent with this name' });
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

// @desc    Delete agent
// @route   DELETE /api/qa/agents/:id
// @access  Private
exports.deleteAgent = async (req, res) => {
  try {
    // Find agent only if it belongs to current user
    const agent = await Agent.findOne({ _id: req.params.id, createdBy: req.user._id });

    if (!agent) {
      return res.status(404).json({ message: 'Agent not found' });
    }

    // Check if agent has tickets (only check current user's tickets)
    const ticketCount = await Ticket.countDocuments({
      agent: agent._id,
      createdBy: req.user._id
    });
    if (ticketCount > 0) {
      return res.status(400).json({
        message: `Cannot delete agent with ${ticketCount} associated ticket(s). Please delete or reassign tickets first.`
      });
    }

    await Agent.findByIdAndDelete(req.params.id);
    logger.info(`Agent deleted: ${agent.name} by user ${req.user.email}`);
    res.json({ message: 'Agent deleted successfully' });
  } catch (error) {
    logger.error('Error deleting agent:', error);
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

    if (search) {
      filter.$or = [
        { ticketId: { $regex: search, $options: 'i' } },
        { shortDescription: { $regex: search, $options: 'i' } },
        { notes: { $regex: search, $options: 'i' } }
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
    // Check if agent exists and belongs to current user
    const agent = await Agent.findOne({ _id: req.body.agent, createdBy: req.user._id });
    if (!agent) {
      return res.status(400).json({ message: 'Invalid agent ID or agent does not belong to you' });
    }

    const ticket = await Ticket.create({
      ...req.body,
      createdBy: req.user._id
    });

    const populatedTicket = await Ticket.findById(ticket._id)
      .populate('agent', 'name team position')
      .populate('createdBy', 'name email');

    logger.info(`Ticket created: ${ticket.ticketId} by user ${req.user.email}`);
    res.status(201).json(populatedTicket);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Ticket with this ID already exists' });
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
    // If agent is being updated, check if it exists and belongs to current user
    if (req.body.agent) {
      const agent = await Agent.findOne({ _id: req.body.agent, createdBy: req.user._id });
      if (!agent) {
        return res.status(400).json({ message: 'Invalid agent ID or agent does not belong to you' });
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

    logger.info(`Ticket updated: ${ticket.ticketId} by user ${req.user.email}`);
    res.json(ticket);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Ticket with this ID already exists' });
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
    const filter = {
      agent: agentId,
      isArchived: false,
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

    // Create Excel workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Maestro Unos');

    // Set column width (no header)
    worksheet.getColumn(1).width = 20;

    // Add ticket IDs directly (no header row)
    tickets.forEach(ticket => {
      worksheet.addRow([ticket.ticketId]);
    });

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

    const fileName = `${agentNameClean}_${dateFromFormatted}_${dateToFormatted}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');

    // Write to response
    await workbook.xlsx.write(res);

    logger.info(`Maestro export generated: ${fileName} for agent ${agent.name} (${tickets.length} tickets) by user ${req.user.email}`);
    res.end();
  } catch (error) {
    logger.error('Error exporting Maestro:', error);
    res.status(500).json({ message: 'Server error' });
  }
};
