const Agent = require('../models/Agent');
const Ticket = require('../models/Ticket');
const TLTeamAssignment = require('../models/TLTeamAssignment');
const User = require('../models/User');

// Available teams for BG office
const BG_TEAMS = ['BG I', 'BG II', 'BG III', 'Turkish Team', 'French Team', 'German Team', 'Korean Team', 'Arabic Team'];

// Hardcoded admins who always have TL access to all teams
const TL_SUPER_ADMINS = ['filipkozomara@mebit.io'];

// Helper: get teams for a user (checks hardcoded admins first)
const getTeamsForUser = async (user) => {
  if (TL_SUPER_ADMINS.includes(user.email?.toLowerCase())) {
    return BG_TEAMS;
  }
  const assignment = await TLTeamAssignment.findOne({ userId: user._id }).lean();
  return assignment?.teams || [];
};

// Helper: get date range from period
const getDateRange = (period) => {
  const days = parseInt(period) || 30;
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  return { startDate, endDate, days };
};

// Helper: calculate scorecard analysis from tickets
const calculateScorecardAnalysis = (tickets) => {
  const scorecardAverages = {};
  const scorecardCounts = {};

  tickets.forEach(ticket => {
    if (ticket.scorecardValues) {
      Object.entries(ticket.scorecardValues).forEach(([key, value]) => {
        if (value !== null && value !== undefined && value !== 4) {
          if (!scorecardAverages[key]) {
            scorecardAverages[key] = 0;
            scorecardCounts[key] = 0;
          }
          const scorePercent = (3 - value) / 3 * 100;
          scorecardAverages[key] += scorePercent;
          scorecardCounts[key] += 1;
        }
      });
    }
  });

  const analysis = Object.entries(scorecardAverages)
    .map(([key, total]) => {
      const avg = Math.round(total / scorecardCounts[key]);
      const label = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      return { key, name: label, avgScore: avg, count: scorecardCounts[key] };
    })
    .sort((a, b) => a.avgScore - b.avgScore);

  return {
    strengths: analysis.filter(s => s.avgScore >= 80),
    weaknesses: analysis.filter(s => s.avgScore < 80)
  };
};

// Helper: calculate top categories (ALL tickets, sorted by worst avg %)
const calculateTopCategories = (tickets) => {
  const categoryMap = {};
  tickets.forEach(ticket => {
    (ticket.categories || []).forEach(cat => {
      if (!categoryMap[cat]) {
        categoryMap[cat] = { count: 0, totalScore: 0 };
      }
      categoryMap[cat].count += 1;
      categoryMap[cat].totalScore += ticket.qualityScorePercent;
    });
  });

  return Object.entries(categoryMap)
    .map(([name, data]) => ({
      name,
      count: data.count,
      avgScore: Math.round(data.totalScore / data.count)
    }))
    .sort((a, b) => a.avgScore - b.avgScore)
    .slice(0, 5);
};

// Helper: calculate score distribution
const calculateScoreDistribution = (tickets) => {
  const buckets = [
    { label: '0-20', min: 0, max: 20, count: 0 },
    { label: '20-40', min: 20, max: 40, count: 0 },
    { label: '40-60', min: 40, max: 60, count: 0 },
    { label: '60-80', min: 60, max: 80, count: 0 },
    { label: '80-100', min: 80, max: 100, count: 0 }
  ];

  tickets.forEach(ticket => {
    const score = ticket.qualityScorePercent;
    if (score != null) {
      for (const bucket of buckets) {
        if (score >= bucket.min && (score < bucket.max || (bucket.max === 100 && score <= 100))) {
          bucket.count++;
          break;
        }
      }
    }
  });

  return buckets;
};

// Helper: calculate agent performance stats
const calculateAgentPerformance = (agents, tickets) => {
  const agentMap = {};
  agents.forEach(a => {
    agentMap[a._id.toString()] = {
      _id: a._id,
      name: a.name,
      position: a.position,
      team: a.team,
      tickets: 0,
      totalScore: 0,
      avgScore: null
    };
  });

  tickets.forEach(t => {
    const aid = t.agent.toString();
    if (agentMap[aid]) {
      agentMap[aid].tickets += 1;
      agentMap[aid].totalScore += t.qualityScorePercent;
    }
  });

  return Object.values(agentMap)
    .map(a => ({
      ...a,
      avgScore: a.tickets > 0 ? Math.round(a.totalScore / a.tickets) : null
    }))
    .sort((a, b) => (b.avgScore || 0) - (a.avgScore || 0));
};

// ==================== MY TEAMS ====================

exports.getMyTeams = async (req, res) => {
  try {
    const teams = await getTeamsForUser(req.user);
    res.json({
      teams,
      office: 'BG',
      availableTeams: BG_TEAMS
    });
  } catch (error) {
    console.error('Error getting TL teams:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// ==================== DASHBOARD ====================

exports.getDashboard = async (req, res) => {
  try {
    const { period = 30 } = req.query;
    const { startDate, endDate } = getDateRange(period);

    // Get TL's assigned teams
    const teams = await getTeamsForUser(req.user);

    if (teams.length === 0) {
      return res.json({
        teams: [],
        overall: null,
        teamSummaries: []
      });
    }

    // Get all agents in assigned teams
    const agents = await Agent.find({
      team: { $in: teams },
      isRemoved: { $ne: true }
    }).select('name position team').lean();

    const agentIds = agents.map(a => a._id);

    // Get all graded tickets for these agents in period
    const tickets = await Ticket.find({
      agent: { $in: agentIds },
      gradedDate: { $gte: startDate, $lte: endDate },
      qualityScorePercent: { $ne: null }
    }).select('agent qualityScorePercent categories scorecardValues gradedDate').lean();

    // Overall metrics
    const scorecardAnalysis = calculateScorecardAnalysis(tickets);
    const topCategories = calculateTopCategories(tickets);
    const agentPerformance = calculateAgentPerformance(agents, tickets);
    const scoreDistribution = calculateScoreDistribution(tickets);

    // Top & bottom performers (min 3 tickets)
    const qualifiedAgents = agentPerformance.filter(a => a.tickets >= 3);
    const topPerformers = qualifiedAgents.slice(0, 3);
    const bottomPerformers = qualifiedAgents.slice(-3).reverse();

    const overallAvgScore = tickets.length > 0
      ? Math.round(tickets.reduce((s, t) => s + t.qualityScorePercent, 0) / tickets.length)
      : null;

    // Per-team summaries
    const teamSummaries = teams.map(teamName => {
      const teamAgents = agents.filter(a => a.team === teamName);
      const teamAgentIds = teamAgents.map(a => a._id.toString());
      const teamTickets = tickets.filter(t => teamAgentIds.includes(t.agent.toString()));

      const avgScore = teamTickets.length > 0
        ? Math.round(teamTickets.reduce((s, t) => s + t.qualityScorePercent, 0) / teamTickets.length)
        : null;

      // Find worst category for this team
      const teamCategories = calculateTopCategories(teamTickets);

      return {
        teamName,
        agentCount: teamAgents.length,
        ticketCount: teamTickets.length,
        avgScore,
        worstCategory: teamCategories[0] || null
      };
    });

    res.json({
      teams,
      overall: {
        totalAgents: agents.length,
        totalTickets: tickets.length,
        avgScore: overallAvgScore,
        scorecardAnalysis,
        topCategories,
        agentPerformance,
        topPerformers,
        bottomPerformers,
        scoreDistribution
      },
      teamSummaries
    });
  } catch (error) {
    console.error('Error getting TL dashboard:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// ==================== TEAM DETAIL ====================

exports.getTeamDetail = async (req, res) => {
  try {
    const { teamName } = req.params;
    const { period = 30 } = req.query;
    const { startDate, endDate } = getDateRange(period);

    // Verify TL has access to this team
    const teams = await getTeamsForUser(req.user);

    if (!teams.includes(teamName)) {
      return res.status(403).json({ message: 'Not authorized to view this team' });
    }

    // Get team agents
    const agents = await Agent.find({
      team: teamName,
      isRemoved: { $ne: true }
    }).select('name position team').lean();

    const agentIds = agents.map(a => a._id);

    // Get tickets
    const tickets = await Ticket.find({
      agent: { $in: agentIds },
      gradedDate: { $gte: startDate, $lte: endDate },
      qualityScorePercent: { $ne: null }
    }).select('agent qualityScorePercent categories scorecardValues gradedDate').lean();

    // Metrics
    const scorecardAnalysis = calculateScorecardAnalysis(tickets);
    const topCategories = calculateTopCategories(tickets);
    const agentPerformance = calculateAgentPerformance(agents, tickets);
    const scoreDistribution = calculateScoreDistribution(tickets);

    const qualifiedAgents = agentPerformance.filter(a => a.tickets >= 3);
    const topPerformers = qualifiedAgents.slice(0, 3);
    const bottomPerformers = qualifiedAgents.slice(-3).reverse();

    const overallAvgScore = tickets.length > 0
      ? Math.round(tickets.reduce((s, t) => s + t.qualityScorePercent, 0) / tickets.length)
      : null;

    res.json({
      teamName,
      totalAgents: agents.length,
      totalTickets: tickets.length,
      avgScore: overallAvgScore,
      scorecardAnalysis,
      topCategories,
      agentPerformance,
      topPerformers,
      bottomPerformers,
      scoreDistribution
    });
  } catch (error) {
    console.error('Error getting team detail:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// ==================== AGENT DETAIL ====================

exports.getAgentDetail = async (req, res) => {
  try {
    const { agentId } = req.params;
    const { period = 30 } = req.query;
    const { startDate, endDate, days } = getDateRange(period);

    // Get agent
    const agent = await Agent.findById(agentId).select('name position team').lean();
    if (!agent) {
      return res.status(404).json({ message: 'Agent not found' });
    }

    // Verify TL has access to this agent's team
    const teams = await getTeamsForUser(req.user);

    if (!teams.includes(agent.team)) {
      return res.status(403).json({ message: 'Not authorized to view this agent' });
    }

    // Previous period for trend
    const prevEndDate = new Date(startDate);
    prevEndDate.setDate(prevEndDate.getDate() - 1);
    const prevStartDate = new Date(prevEndDate);
    prevStartDate.setDate(prevStartDate.getDate() - days);

    // All tickets for current period
    const allTickets = await Ticket.find({
      agent: agentId,
      gradedDate: { $gte: startDate, $lte: endDate },
      qualityScorePercent: { $ne: null }
    }).select('ticketId qualityScorePercent categories feedback notes gradedDate scorecardValues scorecardVariant').lean();

    // Previous period tickets
    const prevTickets = await Ticket.find({
      agent: agentId,
      gradedDate: { $gte: prevStartDate, $lte: prevEndDate },
      qualityScorePercent: { $ne: null }
    }).select('qualityScorePercent').lean();

    // Bad tickets (< 90%)
    const badTickets = allTickets.filter(t => t.qualityScorePercent < 90);

    // Averages
    const currentAvgScore = allTickets.length > 0
      ? Math.round(allTickets.reduce((s, t) => s + t.qualityScorePercent, 0) / allTickets.length)
      : null;

    const prevAvgScore = prevTickets.length > 0
      ? Math.round(prevTickets.reduce((s, t) => s + t.qualityScorePercent, 0) / prevTickets.length)
      : null;

    // Trend
    let trend = 'stable';
    let trendValue = 0;
    if (currentAvgScore !== null && prevAvgScore !== null) {
      trendValue = currentAvgScore - prevAvgScore;
      if (trendValue >= 3) trend = 'improving';
      else if (trendValue <= -3) trend = 'declining';
    }

    // Scorecard analysis
    const scorecardAnalysis = calculateScorecardAnalysis(allTickets);

    // Top categories (ALL tickets, worst % first)
    const topCategories = calculateTopCategories(allTickets);

    // Score distribution
    const scoreDistribution = calculateScoreDistribution(allTickets);

    // Strip HTML helper
    const stripHtml = (html) => {
      if (!html) return '';
      return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    };

    // Severity groups from bad tickets
    const ticketExamples = badTickets.map(t => ({
      _id: t._id,
      ticketId: t.ticketId,
      score: t.qualityScorePercent,
      categories: t.categories || [],
      gradedDate: t.gradedDate,
      feedbackPreview: stripHtml(t.feedback)?.substring(0, 200) || '',
      notesPreview: stripHtml(t.notes)?.substring(0, 150) || ''
    }));

    const severityGroups = {
      critical: ticketExamples.filter(t => t.score < 50),
      bad: ticketExamples.filter(t => t.score >= 50 && t.score < 70),
      moderate: ticketExamples.filter(t => t.score >= 70 && t.score < 90)
    };

    res.json({
      agent,
      summary: {
        totalTickets: allTickets.length,
        ticketsWithIssues: badTickets.length,
        avgScore: currentAvgScore,
        trend,
        trendValue: trendValue > 0 ? `+${trendValue}` : `${trendValue}`
      },
      scorecardAnalysis,
      topCategories,
      severityGroups,
      scoreDistribution
    });
  } catch (error) {
    console.error('Error getting agent detail:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// ==================== ADMIN ENDPOINTS ====================

exports.getTeamLeaders = async (req, res) => {
  try {
    const tls = await User.find({ role: 'tl' }).select('name email role').lean();
    res.json(tls);
  } catch (error) {
    console.error('Error getting team leaders:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.getAssignments = async (req, res) => {
  try {
    const assignments = await TLTeamAssignment.find()
      .populate('userId', 'name email role')
      .lean();

    res.json({
      assignments,
      availableTeams: BG_TEAMS
    });
  } catch (error) {
    console.error('Error getting assignments:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.updateAssignment = async (req, res) => {
  try {
    const { userId } = req.params;
    const { teams } = req.body;

    // Verify user exists and is TL
    const user = await User.findById(userId).select('name email role').lean();
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Validate teams
    const validTeams = (teams || []).filter(t => BG_TEAMS.includes(t));

    if (validTeams.length === 0) {
      // Remove assignment if no teams
      await TLTeamAssignment.deleteOne({ userId });
      return res.json({ message: 'Assignment removed', userId, teams: [] });
    }

    const assignment = await TLTeamAssignment.findOneAndUpdate(
      { userId },
      { userId, teams: validTeams, office: 'BG' },
      { upsert: true, new: true }
    ).populate('userId', 'name email role');

    res.json(assignment);
  } catch (error) {
    console.error('Error updating assignment:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.deleteAssignment = async (req, res) => {
  try {
    const { userId } = req.params;
    await TLTeamAssignment.deleteOne({ userId });
    res.json({ message: 'Assignment deleted' });
  } catch (error) {
    console.error('Error deleting assignment:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.getAvailableTeams = async (req, res) => {
  res.json({ teams: BG_TEAMS });
};
