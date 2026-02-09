const Summary = require('../models/Summary');
const Ticket = require('../models/Ticket');
const { generateAgentSummary } = require('../utils/openai');

// Helper function to get start and end of a day (UTC)
const getDayBoundaries = (date) => {
  const d = new Date(date);
  // Use UTC to avoid timezone issues
  const startOfDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
  const endOfDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999));

  return { startOfDay, endOfDay };
};

// Helper function to get week boundaries (Monday to Sunday)
const getWeekBoundaries = (date) => {
  const monday = Summary.getMondayOfWeek(date);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);

  return { monday, sunday };
};

// Helper function to check if date is in range (UTC comparison)
const isDateInRange = (date, start, end) => {
  if (!date) return false;
  const d = new Date(date);
  return d >= start && d <= end;
};

// Helper function to calculate average score
const calculateAverageScore = (tickets) => {
  const gradedTickets = tickets.filter(t => t.qualityScorePercent !== null && t.qualityScorePercent !== undefined);
  if (gradedTickets.length === 0) return null;

  const sum = gradedTickets.reduce((acc, t) => acc + t.qualityScorePercent, 0);
  return parseFloat((sum / gradedTickets.length).toFixed(2));
};

/**
 * Generate a new summary for a specific date
 * POST /api/qa/summaries
 */
const generateSummary = async (req, res) => {
  try {
    const { date } = req.body;
    const userId = req.user._id;

    if (!date) {
      return res.status(400).json({ message: 'Date is required' });
    }

    const targetDate = new Date(date);

    // Validate date is within current week
    if (!Summary.isDateInCurrentWeek(targetDate)) {
      return res.status(400).json({
        message: 'Date must be within current week (Monday to today)'
      });
    }

    const { startOfDay, endOfDay } = getDayBoundaries(targetDate);
    const { monday, sunday } = getWeekBoundaries(targetDate);

    // Fetch all tickets for this user on this day
    const dayTickets = await Ticket.find({
      createdBy: userId,
      isArchived: false,
      $or: [
        { dateEntered: { $gte: startOfDay, $lte: endOfDay } },
        { gradedDate: { $gte: startOfDay, $lte: endOfDay } }
      ]
    }).populate('agent', 'name');

    if (dayTickets.length === 0) {
      return res.status(400).json({
        message: 'No ticket activity found for this day'
      });
    }

    // Determine shift based on ticket activity times
    const shift = Summary.determineShift(dayTickets, startOfDay, endOfDay);

    // Check if summary already exists for this date and shift
    const existingSummary = await Summary.findOne({
      userId,
      date: { $gte: startOfDay, $lte: endOfDay },
      shift
    });

    if (existingSummary) {
      return res.status(400).json({
        message: `Summary already exists for this date and ${shift} shift. You can edit or delete it.`,
        existingSummaryId: existingSummary._id
      });
    }

    // Get all tickets for this week (for "ukupno" count)
    const weekTickets = await Ticket.find({
      createdBy: userId,
      isArchived: false,
      $or: [
        { dateEntered: { $gte: monday, $lte: sunday } },
        { gradedDate: { $gte: monday, $lte: sunday } }
      ]
    }).populate('agent', 'name');

    // Group tickets by agent
    const agentGroups = {};

    dayTickets.forEach(ticket => {
      const agentId = ticket.agent._id.toString();
      const agentName = ticket.agent.name;

      if (!agentGroups[agentId]) {
        agentGroups[agentId] = {
          agentId,
          agentName,
          selectedOnly: [],
          gradedOnly: [],
          selectedAndGraded: [],
          draftOnly: []
        };
      }

      const selectedOnDay = isDateInRange(ticket.dateEntered, startOfDay, endOfDay);
      const gradedOnDay = ticket.gradedDate && isDateInRange(ticket.gradedDate, startOfDay, endOfDay);

      if (selectedOnDay && gradedOnDay) {
        agentGroups[agentId].selectedAndGraded.push(ticket);
      } else if (gradedOnDay) {
        agentGroups[agentId].gradedOnly.push(ticket);
      } else if (selectedOnDay && ticket.status === 'Selected') {
        agentGroups[agentId].selectedOnly.push(ticket);
      } else if (selectedOnDay && ticket.status === 'Draft') {
        agentGroups[agentId].draftOnly.push(ticket);
      }
    });

    // Calculate weekly totals and scores per agent
    const weeklyTotalsPerAgent = {};
    const weeklyGradedTicketsPerAgent = {};
    weekTickets.forEach(ticket => {
      const agentId = ticket.agent._id.toString();
      if (!weeklyTotalsPerAgent[agentId]) {
        weeklyTotalsPerAgent[agentId] = 0;
        weeklyGradedTicketsPerAgent[agentId] = [];
      }
      weeklyTotalsPerAgent[agentId]++;
      // Collect all graded tickets for overall score calculation
      if (ticket.qualityScorePercent !== null && ticket.qualityScorePercent !== undefined) {
        weeklyGradedTicketsPerAgent[agentId].push(ticket);
      }
    });

    // STEP 1: Build structure for each agent
    const agentSummaries = [];
    const agentsSummarized = [];
    let totalSelected = 0;
    let totalGraded = 0;
    let totalBoth = 0;
    let totalDraft = 0;

    for (const [agentId, group] of Object.entries(agentGroups)) {
      const weeklyTotal = weeklyTotalsPerAgent[agentId] || 0;

      const selectedOnlyCount = group.selectedOnly.length;
      const gradedOnlyCount = group.gradedOnly.length;
      const bothCount = group.selectedAndGraded.length;
      const draftCount = group.draftOnly.length;

      // For display purposes: tickets that are both selected AND graded should count in BOTH categories
      // displaySelectedCount = tickets that were selected today (selectedOnly + both)
      // displayGradedCount = tickets that were graded today (gradedOnly + both)
      const displaySelectedCount = selectedOnlyCount + bothCount;
      const displayGradedCount = gradedOnlyCount + bothCount;

      totalSelected += selectedOnlyCount;
      totalGraded += gradedOnlyCount;
      totalBoth += bothCount;
      totalDraft += draftCount;

      const allGradedTickets = [...group.gradedOnly, ...group.selectedAndGraded];

      // Calculate OVERALL score from all weekly graded tickets (not just today's)
      const weeklyGradedTickets = weeklyGradedTicketsPerAgent[agentId] || [];
      const overallScore = calculateAverageScore(weeklyGradedTickets);

      // Today's graded count for comparison
      const todayGradedCount = gradedOnlyCount + bothCount;

      // Only show "ukupno" if there are tickets from previous days (weeklyTotal > todayGradedCount)
      const showUkupno = weeklyTotal > todayGradedCount;
      const ukupnoText = showUkupno ? ` ukupno ${weeklyTotal}` : '';

      // Draft suffix for title
      const draftSuffix = draftCount > 0 ? ` (${draftCount} draft ${draftCount === 1 ? 'tiket' : 'tiketa'})` : '';

      let headerLine = '';
      let type = '';
      let needsAISummary = false;

      // Build header based on scenario - using displaySelectedCount and displayGradedCount
      // so tickets that are both selected AND graded count in both categories
      if (displaySelectedCount > 0 && displayGradedCount === 0) {
        // Only selected (no graded) - no AI needed
        headerLine = `${group.agentName} - izdvojeno ${displaySelectedCount} tiketa${draftSuffix}`;
        type = 'selected';
      } else if (displayGradedCount > 0 && displaySelectedCount === 0) {
        // Only graded (not selected today)
        headerLine = `${group.agentName} - ocenjeno ${displayGradedCount}${ukupnoText}${overallScore !== null ? ` - ${overallScore}%` : ''}${draftSuffix}`;
        type = 'graded';
        needsAISummary = true;
      } else if (displaySelectedCount > 0 && displayGradedCount > 0) {
        // Both selected and graded (could be same tickets or different)
        headerLine = `${group.agentName} - izdvojeno ${displaySelectedCount} ocenjeno ${displayGradedCount}${ukupnoText}${overallScore !== null ? ` - ${overallScore}%` : ''}${draftSuffix}`;
        type = 'both';
        needsAISummary = true;
      } else if (draftCount > 0) {
        // Only draft tickets
        headerLine = `${group.agentName} - ${draftCount} draft ${draftCount === 1 ? 'tiket' : 'tiketa'}`;
        type = 'draft';
      }

      if (headerLine) {
        agentSummaries.push({
          header: headerLine,
          description: null,
          tickets: needsAISummary ? allGradedTickets : [],
          agentName: group.agentName
        });
      }

      // Track agent summary metadata
      if (selectedOnlyCount > 0 || gradedOnlyCount > 0 || bothCount > 0 || draftCount > 0) {
        agentsSummarized.push({
          agentId: group.agentId,
          agentName: group.agentName,
          type: type || 'selected',
          count: selectedOnlyCount + gradedOnlyCount + bothCount + draftCount,
          weeklyTotal,
          averageScore: overallScore,
          draftCount
        });
      }
    }

    // STEP 2: Call AI for each agent that needs a summary
    console.log(`Generating AI summaries for ${agentSummaries.filter(a => a.tickets.length > 0).length} agents...`);

    for (const agentSummary of agentSummaries) {
      if (agentSummary.tickets.length > 0) {
        try {
          // Prepare ticket data for AI
          const ticketData = agentSummary.tickets.map(t => ({
            ticketId: t.ticketId,
            notes: t.notes || '',
            feedback: t.feedback || '',
            score: t.qualityScorePercent,
            category: t.category || ''
          }));

          console.log(`Calling AI for ${agentSummary.agentName} with ${ticketData.length} tickets...`);

          // Call AI for this specific agent
          const aiDescription = await generateAgentSummary(agentSummary.agentName, ticketData);

          if (aiDescription) {
            agentSummary.description = aiDescription;
            console.log(`Got AI summary for ${agentSummary.agentName}: ${aiDescription.substring(0, 50)}...`);
          } else {
            console.log(`No AI summary returned for ${agentSummary.agentName}`);
          }
        } catch (aiError) {
          console.error(`AI error for ${agentSummary.agentName}:`, aiError.message);
          // Continue without AI summary for this agent
        }
      }
    }

    // STEP 3: Combine everything into final content
    let content = '';
    for (const agentSummary of agentSummaries) {
      content += agentSummary.header + '\n';
      if (agentSummary.description) {
        content += agentSummary.description + '\n';
      }
      content += '\n';
    }

    // Format title
    const title = Summary.formatTitle(targetDate, shift);

    // Create and save summary
    try {
      const summary = await Summary.create({
        userId,
        date: startOfDay,
        shift,
        title,
        content: content.trim(),
        metadata: {
          ticketCount: {
            selected: totalSelected,
            graded: totalGraded,
            both: totalBoth,
            draft: totalDraft
          },
          agentsSummarized,
          generatedAt: new Date()
        }
      });

      res.status(201).json(summary);
    } catch (createError) {
      // Handle duplicate key error - summary already exists
      if (createError.code === 11000) {
        // Try to find and return the existing summary
        const existingSummary = await Summary.findOne({ userId, date: startOfDay, shift });
        return res.status(400).json({
          message: `Summary already exists for this date and ${shift} shift. You can edit or delete it.`,
          existingSummaryId: existingSummary?._id
        });
      }
      throw createError;
    }
  } catch (error) {
    console.error('Generate summary error:', error);
    res.status(500).json({ message: 'Failed to generate summary', error: error.message });
  }
};

/**
 * Get all summaries for the current user
 * GET /api/qa/summaries
 */
const getAllSummaries = async (req, res) => {
  try {
    const userId = req.user._id;
    const { month, year, page = 1, limit = 20 } = req.query;

    const query = { userId };

    // Filter by month/year if provided
    if (month && year) {
      const startOfMonth = new Date(year, month - 1, 1);
      const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999);
      query.date = { $gte: startOfMonth, $lte: endOfMonth };
    }

    const total = await Summary.countDocuments(query);
    const summaries = await Summary.find(query)
      .sort({ date: -1, shift: 1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    res.json({
      summaries,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get summaries error:', error);
    res.status(500).json({ message: 'Failed to fetch summaries', error: error.message });
  }
};

/**
 * Get all summaries from ALL users (for "All Summaries" view)
 * GET /api/qa/summaries/all
 */
const getAllSummariesFromAllUsers = async (req, res) => {
  try {
    const { page = 1, limit = 50, shift, graderId } = req.query;

    const query = {};

    // Optional shift filter
    if (shift && shift !== 'all') {
      query.shift = shift;
    }

    // Optional grader (user) filter
    if (graderId && graderId !== 'all') {
      query.userId = graderId;
    }

    const total = await Summary.countDocuments(query);
    const summaries = await Summary.find(query)
      .populate('userId', 'name email')
      .sort({ date: -1, shift: 1 }) // Sort by date DESC, then shift (Afternoon before Morning alphabetically, but we want Morning first)
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    // Re-sort to ensure Morning comes before Afternoon for same date
    const sortedSummaries = summaries.sort((a, b) => {
      const dateA = new Date(a.date).getTime();
      const dateB = new Date(b.date).getTime();
      if (dateB !== dateA) return dateB - dateA; // Date descending
      // For same date, Morning before Afternoon
      if (a.shift === 'Morning' && b.shift === 'Afternoon') return -1;
      if (a.shift === 'Afternoon' && b.shift === 'Morning') return 1;
      return 0;
    });

    res.json({
      summaries: sortedSummaries,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get all summaries error:', error);
    res.status(500).json({ message: 'Failed to fetch all summaries', error: error.message });
  }
};

/**
 * Get list of graders who have summaries (for filter dropdown)
 * GET /api/qa/summaries/graders
 */
const getSummaryGraders = async (req, res) => {
  try {
    const graders = await Summary.aggregate([
      {
        $group: {
          _id: '$userId',
          summaryCount: { $sum: 1 }
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'user'
        }
      },
      {
        $unwind: '$user'
      },
      {
        $project: {
          _id: 1,
          name: '$user.name',
          email: '$user.email',
          summaryCount: 1
        }
      },
      {
        $sort: { name: 1 }
      }
    ]);

    res.json({ graders });
  } catch (error) {
    console.error('Get summary graders error:', error);
    res.status(500).json({ message: 'Failed to fetch graders', error: error.message });
  }
};

/**
 * Get dates that have summaries (for calendar highlighting)
 * GET /api/qa/summaries/dates
 */
const getSummaryDates = async (req, res) => {
  try {
    const userId = req.user._id;
    const { month, year } = req.query;

    if (!month || !year) {
      return res.status(400).json({ message: 'Month and year are required' });
    }

    const startOfMonth = new Date(year, month - 1, 1);
    const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999);

    const summaries = await Summary.find({
      userId,
      date: { $gte: startOfMonth, $lte: endOfMonth }
    }).select('date shift');

    // Group by date
    const dateMap = {};
    summaries.forEach(s => {
      const dateKey = s.date.toISOString().split('T')[0];
      if (!dateMap[dateKey]) {
        dateMap[dateKey] = [];
      }
      dateMap[dateKey].push(s.shift);
    });

    const dates = Object.entries(dateMap).map(([date, shifts]) => ({
      date,
      shifts
    }));

    res.json({ dates });
  } catch (error) {
    console.error('Get summary dates error:', error);
    res.status(500).json({ message: 'Failed to fetch summary dates', error: error.message });
  }
};

/**
 * Get a single summary by ID
 * GET /api/qa/summaries/:id
 */
const getSummary = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const summary = await Summary.findOne({ _id: id, userId });

    if (!summary) {
      return res.status(404).json({ message: 'Summary not found' });
    }

    res.json(summary);
  } catch (error) {
    console.error('Get summary error:', error);
    res.status(500).json({ message: 'Failed to fetch summary', error: error.message });
  }
};

/**
 * Update a summary's content
 * PUT /api/qa/summaries/:id
 */
const updateSummary = async (req, res) => {
  try {
    const { id } = req.params;
    const { content } = req.body;
    const userId = req.user._id;

    if (!content) {
      return res.status(400).json({ message: 'Content is required' });
    }

    const summary = await Summary.findOneAndUpdate(
      { _id: id, userId },
      { content },
      { new: true }
    );

    if (!summary) {
      return res.status(404).json({ message: 'Summary not found' });
    }

    res.json(summary);
  } catch (error) {
    console.error('Update summary error:', error);
    res.status(500).json({ message: 'Failed to update summary', error: error.message });
  }
};

/**
 * Delete a summary
 * DELETE /api/qa/summaries/:id
 */
const deleteSummary = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const summary = await Summary.findOneAndDelete({ _id: id, userId });

    if (!summary) {
      return res.status(404).json({ message: 'Summary not found' });
    }

    res.json({ message: 'Summary deleted successfully' });
  } catch (error) {
    console.error('Delete summary error:', error);
    res.status(500).json({ message: 'Failed to delete summary', error: error.message });
  }
};

module.exports = {
  generateSummary,
  getAllSummaries,
  getAllSummariesFromAllUsers,
  getSummaryGraders,
  getSummaryDates,
  getSummary,
  updateSummary,
  deleteSummary
};
