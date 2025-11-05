const Ticket = require('../models/Ticket');
const Agent = require('../models/Agent');
const { generateFeedbackSuggestions, analyzeAgentPerformance } = require('../services/openaiService');
const logger = require('../utils/logger');

// @desc    Get AI-powered feedback suggestions for a ticket
// @route   POST /api/qa/ai/suggest-feedback
// @access  Private
const getSuggestedFeedback = async (req, res) => {
  try {
    const { ticketId } = req.body;

    if (!ticketId) {
      return res.status(400).json({ message: 'Ticket ID is required' });
    }

    // Get the current ticket
    const currentTicket = await Ticket.findOne({ ticketId })
      .populate('agent', 'name team position');

    if (!currentTicket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    // Get historical tickets from the same agent with feedback
    const historicalTickets = await Ticket.find({
      agent: currentTicket.agent._id,
      feedback: { $exists: true, $ne: '', $ne: null },
      _id: { $ne: currentTicket._id } // Exclude current ticket
    })
      .populate('agent', 'name')
      .sort({ dateEntered: -1 })
      .limit(20); // Get last 20 tickets with feedback

    if (historicalTickets.length === 0) {
      return res.json({
        success: false,
        message: 'No historical feedback data available for this agent yet. As you add more feedback, AI suggestions will improve.',
        suggestions: null
      });
    }

    // Generate AI suggestions
    const result = await generateFeedbackSuggestions(currentTicket, historicalTickets);

    if (!result.success) {
      return res.status(500).json({
        message: 'Failed to generate AI suggestions',
        error: result.error
      });
    }

    logger.info(`AI suggestions generated for ticket ${ticketId} by user ${req.user.email}`);

    res.json({
      success: true,
      ticket: {
        ticketId: currentTicket.ticketId,
        agent: currentTicket.agent.name,
        description: currentTicket.shortDescription
      },
      suggestions: result.suggestions,
      historicalDataCount: historicalTickets.length,
      tokensUsed: result.tokensUsed
    });
  } catch (error) {
    logger.error('Error in AI feedback suggestion:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Get AI analysis for agent performance
// @route   GET /api/qa/ai/analyze-agent/:agentId
// @access  Private
const getAgentAnalysis = async (req, res) => {
  try {
    const { agentId } = req.params;

    // Verify agent exists
    const agent = await Agent.findById(agentId);
    if (!agent) {
      return res.status(404).json({ message: 'Agent not found' });
    }

    // Get all tickets for this agent with feedback (for current user)
    const agentTickets = await Ticket.find({
      agent: agentId,
      createdBy: req.user._id,
      feedback: { $exists: true, $ne: '', $ne: null }
    })
      .select('ticketId shortDescription qualityScorePercent feedback status dateEntered')
      .sort({ dateEntered: -1 });

    if (agentTickets.length < 3) {
      return res.json({
        success: false,
        message: `Need at least 3 tickets with feedback for AI analysis. Currently have ${agentTickets.length}.`,
        analysis: null
      });
    }

    // Generate AI analysis
    const result = await analyzeAgentPerformance(agentTickets);

    if (!result.success) {
      return res.status(500).json({
        message: result.message || 'Failed to generate agent analysis',
        error: result.error
      });
    }

    logger.info(`AI agent analysis generated for ${agent.name} by user ${req.user.email}`);

    res.json({
      success: true,
      agent: {
        id: agent._id,
        name: agent.name,
        team: agent.team,
        position: agent.position
      },
      ticketsAnalyzed: agentTickets.length,
      analysis: result.analysis,
      tokensUsed: result.tokensUsed
    });
  } catch (error) {
    logger.error('Error in AI agent analysis:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  getSuggestedFeedback,
  getAgentAnalysis
};
