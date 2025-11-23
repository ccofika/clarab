const Ticket = require('../models/Ticket');
const QASession = require('../models/QASession');
const logger = require('../utils/logger');
const { generateEmbedding, cosineSimilarity, qaAssistant } = require('../utils/openai');

// @desc    Get comprehensive analytics
// @route   GET /api/qa/analytics
// @access  Private
exports.getAnalytics = async (req, res) => {
  try {
    const userId = req.user._id;
    const { timeRange = '30d' } = req.query;

    // Calculate date range
    const now = new Date();
    let startDate = new Date();

    switch (timeRange) {
      case '7d':
        startDate.setDate(now.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(now.getDate() - 30);
        break;
      case '90d':
        startDate.setDate(now.getDate() - 90);
        break;
      case 'all':
        startDate = new Date(0);
        break;
      default:
        startDate.setDate(now.getDate() - 30);
    }

    // Get all tickets in range
    const tickets = await Ticket.find({
      createdBy: userId,
      dateEntered: { $gte: startDate }
    }).populate('agent', 'name team');

    const totalTickets = tickets.length;
    const gradedTickets = tickets.filter(t => t.status === 'Graded').length;
    const activeAgents = new Set(tickets.map(t => t.agent?._id?.toString())).size;

    // Calculate average quality score
    const scoredTickets = tickets.filter(t => t.qualityScorePercent !== null && t.qualityScorePercent !== undefined);
    const avgQualityScore = scoredTickets.length > 0
      ? Math.round(scoredTickets.reduce((sum, t) => sum + t.qualityScorePercent, 0) / scoredTickets.length)
      : 0;

    // Quality trend over time (weekly)
    const qualityTrend = [];
    const weeks = Math.ceil((now - startDate) / (7 * 24 * 60 * 60 * 1000));

    for (let i = 0; i < Math.min(weeks, 12); i++) {
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - (i + 1) * 7);
      const weekEnd = new Date(now);
      weekEnd.setDate(now.getDate() - i * 7);

      const weekTickets = tickets.filter(t => {
        const date = new Date(t.dateEntered);
        return date >= weekStart && date < weekEnd && t.qualityScorePercent !== null;
      });

      const avgScore = weekTickets.length > 0
        ? Math.round(weekTickets.reduce((sum, t) => sum + t.qualityScorePercent, 0) / weekTickets.length)
        : null;

      qualityTrend.unshift({
        date: weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        avgScore: avgScore || 0,
        targetScore: 80
      });
    }

    // Agent performance
    const agentStats = {};
    tickets.forEach(ticket => {
      const agentId = ticket.agent?._id?.toString();
      const agentName = ticket.agent?.name || 'Unknown';

      if (!agentStats[agentId]) {
        agentStats[agentId] = {
          name: agentName,
          ticketCount: 0,
          gradedCount: 0,
          totalScore: 0,
          scoredCount: 0
        };
      }

      agentStats[agentId].ticketCount++;
      if (ticket.status === 'Graded') {
        agentStats[agentId].gradedCount++;
      }
      if (ticket.qualityScorePercent !== null) {
        agentStats[agentId].totalScore += ticket.qualityScorePercent;
        agentStats[agentId].scoredCount++;
      }
    });

    const agentPerformance = Object.values(agentStats).map(agent => ({
      name: agent.name,
      avgScore: agent.scoredCount > 0 ? Math.round(agent.totalScore / agent.scoredCount) : 0,
      ticketCount: agent.ticketCount
    })).sort((a, b) => b.avgScore - a.avgScore);

    // Category distribution
    const categoryStats = {};
    tickets.forEach(ticket => {
      const category = ticket.category || 'Other';
      categoryStats[category] = (categoryStats[category] || 0) + 1;
    });

    const categoryDistribution = Object.entries(categoryStats).map(([name, value]) => ({
      name,
      value
    }));

    // Weekly volume
    const weeklyVolume = [];
    for (let i = 0; i < Math.min(weeks, 8); i++) {
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - (i + 1) * 7);
      const weekEnd = new Date(now);
      weekEnd.setDate(now.getDate() - i * 7);

      const weekTickets = tickets.filter(t => {
        const date = new Date(t.dateEntered);
        return date >= weekStart && date < weekEnd;
      });

      const created = weekTickets.length;
      const graded = weekTickets.filter(t => t.status === 'Graded').length;

      weeklyVolume.unshift({
        week: weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        created,
        graded
      });
    }

    // Score distribution
    const scoreRanges = {
      '0-20': 0,
      '20-40': 0,
      '40-60': 0,
      '60-80': 0,
      '80-100': 0
    };

    scoredTickets.forEach(ticket => {
      const score = ticket.qualityScorePercent;
      if (score >= 80) scoreRanges['80-100']++;
      else if (score >= 60) scoreRanges['60-80']++;
      else if (score >= 40) scoreRanges['40-60']++;
      else if (score >= 20) scoreRanges['20-40']++;
      else scoreRanges['0-20']++;
    });

    const scoreDistribution = Object.entries(scoreRanges).map(([range, count]) => ({
      range,
      count
    }));

    // Feedback statistics
    const ticketsWithFeedback = tickets.filter(t => t.feedback && t.feedback.trim().length > 0);
    const feedbackStats = {
      withFeedback: ticketsWithFeedback.length,
      feedbackRate: gradedTickets > 0 ? Math.round((ticketsWithFeedback.length / gradedTickets) * 100) : 0,
      avgLength: ticketsWithFeedback.length > 0
        ? Math.round(ticketsWithFeedback.reduce((sum, t) => sum + t.feedback.length, 0) / ticketsWithFeedback.length)
        : 0,
      topTheme: 'Quality'
    };

    res.json({
      overview: {
        totalTickets,
        gradedTickets,
        activeAgents,
        avgQualityScore,
        gradingRate: totalTickets > 0 ? Math.round((gradedTickets / totalTickets) * 100) : 0,
        ticketsChange: 5,
        qualityChange: 3,
        gradingRateChange: 2
      },
      qualityTrend,
      agentPerformance,
      categoryDistribution,
      weeklyVolume,
      scoreDistribution,
      feedbackStats
    });
  } catch (error) {
    logger.error('Error fetching analytics:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    AI Assistant chat endpoint
// @route   POST /api/qa/ai-assistant
// @access  Private
exports.aiAssistant = async (req, res) => {
  try {
    const { message, conversationHistory = [], sessionId, currentFilters } = req.body;
    const userId = req.user._id;

    if (!message || message.trim().length === 0) {
      return res.status(400).json({ message: 'Message is required' });
    }

    // Find or create session
    let session;
    if (sessionId) {
      session = await QASession.findOne({ _id: sessionId, user: userId });
    }

    if (!session) {
      session = new QASession({
        user: userId,
        title: message.substring(0, 50) + (message.length > 50 ? '...' : ''),
        messages: []
      });
    }

    // Check if user is referencing previous search results
    const isReferencingPrevious = (
      /paste|show|send|give|display|these|those|them|all three|the notes|for those tickets/i.test(message) &&
      !/this week|today|yesterday|find|search/i.test(message)
    ) || (
      // Also trigger if asking for notes/paste without a new search query
      /paste.*notes|send.*notes|give.*notes|notes.*here/i.test(message)
    );

    // Determine if query is date-related
    const isDateQuery = /this week|today|yesterday|last week|this month|last month/i.test(message);

    let searchResults = [];

    // If user is referencing previous results, load them from session
    if (isReferencingPrevious && session.messages && session.messages.length > 0) {
      // Find the last assistant message with searchResults
      const lastAssistantMsg = [...session.messages]
        .reverse()
        .find(msg => msg.role === 'assistant' && msg.searchResults && msg.searchResults.length > 0);

      if (lastAssistantMsg && lastAssistantMsg.searchResults) {
        // Reload those tickets (include both user's tickets and archived tickets)
        const ticketIds = lastAssistantMsg.searchResults;
        const tickets = await Ticket.find({
          _id: { $in: ticketIds }
          // No createdBy filter - allow access to all tickets including archived
        })
        .populate('agent', 'name team')
        .lean();

        searchResults = tickets.map(ticket => ({
          ...ticket,
          relevanceScore: 100
        }));
      }
    } else if (isDateQuery) {
      // For date queries, use date filtering instead of semantic search
      const now = new Date();
      let startDate = new Date();

      if (/this week/i.test(message)) {
        // Get start of week (Monday)
        const day = now.getDay();
        const diff = now.getDate() - day + (day === 0 ? -6 : 1);
        startDate = new Date(now.setDate(diff));
        startDate.setHours(0, 0, 0, 0);
      } else if (/today/i.test(message)) {
        startDate.setHours(0, 0, 0, 0);
      } else if (/yesterday/i.test(message)) {
        startDate.setDate(now.getDate() - 1);
        startDate.setHours(0, 0, 0, 0);
      } else if (/last week/i.test(message)) {
        startDate.setDate(now.getDate() - 7);
      } else if (/this month/i.test(message)) {
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      }

      // For date queries, search across all tickets (including archived)
      // Filter by user's tickets OR archived tickets
      const tickets = await Ticket.find({
        $or: [
          { createdBy: userId },
          { isArchived: true }
        ],
        dateEntered: { $gte: startDate }
      })
      .populate('agent', 'name team')
      .sort({ dateEntered: -1 })
      .limit(10)
      .lean();

      searchResults = tickets.map(ticket => ({
        ...ticket,
        relevanceScore: 100
      }));
    } else {
      // For semantic queries, use embedding search across all tickets (including archived)
      const queryEmbedding = await generateEmbedding(message);

      if (queryEmbedding) {
        const tickets = await Ticket.find({
          $or: [
            { createdBy: userId },
            { isArchived: true }
          ],
          embedding: { $exists: true, $ne: null }
        })
        .populate('agent', 'name team')
        .lean();

        const results = tickets.map(ticket => {
          const similarity = cosineSimilarity(queryEmbedding, ticket.embedding);
          return {
            ...ticket,
            relevanceScore: Math.round(similarity * 100)
          };
        });

        searchResults = results
          .filter(r => r.relevanceScore > 40)
          .sort((a, b) => b.relevanceScore - a.relevanceScore)
          .slice(0, 5);
      }
    }

    // Use the specialized QA Assistant with full ticket data
    const aiResponse = await qaAssistant(
      message,
      conversationHistory.map(msg => ({
        role: msg.role,
        content: msg.content
      })),
      searchResults, // Pass full ticket objects
      {
        activeFilters: currentFilters || {},
        resultsCount: searchResults.length
      }
    );

    const reply = aiResponse.message || 'I apologize, I was unable to generate a response. Please try again.';

    // Validate content before saving
    if (!message || message.trim().length === 0) {
      return res.status(400).json({ message: 'Message cannot be empty' });
    }

    if (!reply || reply.trim().length === 0) {
      return res.status(500).json({ message: 'AI response was empty' });
    }

    // Save message to session
    session.messages.push({
      role: 'user',
      content: message,
      timestamp: new Date()
    });

    session.messages.push({
      role: 'assistant',
      content: reply,
      searchResults: searchResults.map(r => r._id),
      timestamp: new Date()
    });

    await session.save();

    res.json({
      reply,
      searchResults: searchResults.map(r => ({
        _id: r._id,
        ticketId: r.ticketId,
        shortDescription: r.shortDescription,
        qualityScorePercent: r.qualityScorePercent,
        agent: r.agent,
        notes: r.notes,
        feedback: r.feedback,
        relevanceScore: r.relevanceScore
      })),
      sessionId: session._id,
      suggestedFilters: {}
    });
  } catch (error) {
    logger.error('AI assistant error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Get all AI sessions
// @route   GET /api/qa/ai-sessions
// @access  Private
exports.getAISessions = async (req, res) => {
  try {
    const userId = req.user._id;
    const sessions = await QASession.find({ user: userId })
      .select('title lastMessageAt createdAt messages')
      .sort({ lastMessageAt: -1 })
      .limit(50);

    res.json(sessions);
  } catch (error) {
    logger.error('Error fetching AI sessions:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Get single AI session
// @route   GET /api/qa/ai-sessions/:id
// @access  Private
exports.getAISession = async (req, res) => {
  try {
    const userId = req.user._id;
    const session = await QASession.findOne({
      _id: req.params.id,
      user: userId
    }).populate('messages.searchResults');

    if (!session) {
      return res.status(404).json({ message: 'Session not found' });
    }

    res.json(session);
  } catch (error) {
    logger.error('Error fetching AI session:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Delete AI session
// @route   DELETE /api/qa/ai-sessions/:id
// @access  Private
exports.deleteAISession = async (req, res) => {
  try {
    const userId = req.user._id;
    const session = await QASession.findOneAndDelete({
      _id: req.params.id,
      user: userId
    });

    if (!session) {
      return res.status(404).json({ message: 'Session not found' });
    }

    logger.info(`AI session deleted: ${session._id} by user ${req.user.email}`);
    res.json({ message: 'Session deleted successfully' });
  } catch (error) {
    logger.error('Error deleting AI session:', error);
    res.status(500).json({ message: 'Server error' });
  }
};
