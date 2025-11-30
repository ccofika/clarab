const Issue = require('../models/Issue');

// @desc    Get all issues (with optional filter for resolved)
// @route   GET /api/issues
// @access  Public
exports.getIssues = async (req, res) => {
  try {
    const { showResolved, search } = req.query;

    // If search query provided, use text search
    if (search && search.trim()) {
      const issues = await Issue.searchIssues(search.trim(), showResolved === 'true');
      return res.json(issues);
    }

    // Otherwise, get issues based on resolved filter
    let issues;
    if (showResolved === 'true') {
      // Only return resolved issues
      issues = await Issue.find({ status: 'resolved' })
        .sort({ resolvedAt: -1, createdAt: -1 })
        .populate('createdBy', 'name email avatar')
        .populate('resolvedBy', 'name email avatar')
        .populate('updates.author', 'name email avatar');
    } else {
      issues = await Issue.getActiveIssues();
    }

    res.json(issues);
  } catch (error) {
    console.error('Error fetching issues:', error);
    res.status(500).json({ message: 'Error fetching issues', error: error.message });
  }
};

// @desc    Get single issue by ID
// @route   GET /api/issues/:id
// @access  Public
exports.getIssue = async (req, res) => {
  try {
    const issue = await Issue.findById(req.params.id)
      .populate('createdBy', 'name email avatar')
      .populate('resolvedBy', 'name email avatar')
      .populate('updates.author', 'name email avatar');

    if (!issue) {
      return res.status(404).json({ message: 'Issue not found' });
    }

    res.json(issue);
  } catch (error) {
    console.error('Error fetching issue:', error);
    res.status(500).json({ message: 'Error fetching issue', error: error.message });
  }
};

// @desc    Create new issue
// @route   POST /api/issues
// @access  Private (Admin, Developer only)
exports.createIssue = async (req, res) => {
  try {
    // Check if user has permission (admin or developer)
    if (req.user.role !== 'admin' && req.user.role !== 'developer') {
      return res.status(403).json({ message: 'Not authorized to create issues' });
    }

    const { title, description, severity, affectedAreas, images } = req.body;

    const issue = await Issue.create({
      title,
      description,
      severity: severity || 'minor',
      affectedAreas: affectedAreas || [],
      images: images || [],
      createdBy: req.user._id,
      status: 'reported'
    });

    // Populate the created issue
    await issue.populate('createdBy', 'name email avatar');

    res.status(201).json(issue);
  } catch (error) {
    console.error('Error creating issue:', error);
    res.status(500).json({ message: 'Error creating issue', error: error.message });
  }
};

// @desc    Update issue
// @route   PUT /api/issues/:id
// @access  Private (Admin, Developer only)
exports.updateIssue = async (req, res) => {
  try {
    // Check if user has permission
    if (req.user.role !== 'admin' && req.user.role !== 'developer') {
      return res.status(403).json({ message: 'Not authorized to update issues' });
    }

    const issue = await Issue.findById(req.params.id);

    if (!issue) {
      return res.status(404).json({ message: 'Issue not found' });
    }

    const { title, description, severity, affectedAreas, images } = req.body;

    // Update fields if provided
    if (title) issue.title = title;
    if (description) issue.description = description;
    if (severity) issue.severity = severity;
    if (affectedAreas) issue.affectedAreas = affectedAreas;
    if (images) issue.images = images;

    await issue.save();

    // Populate and return
    await issue.populate('createdBy', 'name email avatar');
    await issue.populate('resolvedBy', 'name email avatar');
    await issue.populate('updates.author', 'name email avatar');

    res.json(issue);
  } catch (error) {
    console.error('Error updating issue:', error);
    res.status(500).json({ message: 'Error updating issue', error: error.message });
  }
};

// @desc    Add update to issue
// @route   POST /api/issues/:id/updates
// @access  Private (Admin, Developer only)
exports.addUpdate = async (req, res) => {
  try {
    // Check if user has permission
    if (req.user.role !== 'admin' && req.user.role !== 'developer') {
      return res.status(403).json({ message: 'Not authorized to add updates' });
    }

    const issue = await Issue.findById(req.params.id);

    if (!issue) {
      return res.status(404).json({ message: 'Issue not found' });
    }

    const { message, statusChange, images } = req.body;

    if (!message) {
      return res.status(400).json({ message: 'Update message is required' });
    }

    // Add update using the model method
    await issue.addUpdate(message, req.user._id, statusChange, images || []);

    // Populate and return
    await issue.populate('createdBy', 'name email avatar');
    await issue.populate('resolvedBy', 'name email avatar');
    await issue.populate('updates.author', 'name email avatar');

    res.json(issue);
  } catch (error) {
    console.error('Error adding update:', error);
    res.status(500).json({ message: 'Error adding update', error: error.message });
  }
};

// @desc    Change issue status
// @route   PUT /api/issues/:id/status
// @access  Private (Admin, Developer only)
exports.changeStatus = async (req, res) => {
  try {
    // Check if user has permission
    if (req.user.role !== 'admin' && req.user.role !== 'developer') {
      return res.status(403).json({ message: 'Not authorized to change status' });
    }

    const issue = await Issue.findById(req.params.id);

    if (!issue) {
      return res.status(404).json({ message: 'Issue not found' });
    }

    const { status, message } = req.body;

    if (!status) {
      return res.status(400).json({ message: 'Status is required' });
    }

    const validStatuses = ['reported', 'investigating', 'identified', 'monitoring', 'resolved'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    // Add update with status change
    const updateMessage = message || `Status changed to ${status}`;
    await issue.addUpdate(updateMessage, req.user._id, status);

    // Populate and return
    await issue.populate('createdBy', 'name email avatar');
    await issue.populate('resolvedBy', 'name email avatar');
    await issue.populate('updates.author', 'name email avatar');

    res.json(issue);
  } catch (error) {
    console.error('Error changing status:', error);
    res.status(500).json({ message: 'Error changing status', error: error.message });
  }
};

// @desc    Delete issue
// @route   DELETE /api/issues/:id
// @access  Private (Admin only)
exports.deleteIssue = async (req, res) => {
  try {
    // Only admins can delete issues
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Only admins can delete issues' });
    }

    const issue = await Issue.findById(req.params.id);

    if (!issue) {
      return res.status(404).json({ message: 'Issue not found' });
    }

    await issue.deleteOne();

    res.json({ message: 'Issue deleted successfully' });
  } catch (error) {
    console.error('Error deleting issue:', error);
    res.status(500).json({ message: 'Error deleting issue', error: error.message });
  }
};

// @desc    Get issue statistics
// @route   GET /api/issues/stats
// @access  Public
exports.getStats = async (req, res) => {
  try {
    const stats = await Issue.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    const severityStats = await Issue.aggregate([
      {
        $match: { status: { $ne: 'resolved' } }
      },
      {
        $group: {
          _id: '$severity',
          count: { $sum: 1 }
        }
      }
    ]);

    const totalActive = await Issue.countDocuments({ status: { $ne: 'resolved' } });
    const totalResolved = await Issue.countDocuments({ status: 'resolved' });

    res.json({
      byStatus: stats,
      bySeverity: severityStats,
      totalActive,
      totalResolved,
      total: totalActive + totalResolved
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ message: 'Error fetching stats', error: error.message });
  }
};

// @desc    Add/Update postmortem for a resolved issue
// @route   PUT /api/issues/:id/postmortem
// @access  Private (Admin, Developer only)
exports.updatePostmortem = async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'developer') {
      return res.status(403).json({ message: 'Not authorized to update postmortem' });
    }

    const issue = await Issue.findById(req.params.id);

    if (!issue) {
      return res.status(404).json({ message: 'Issue not found' });
    }

    if (issue.status !== 'resolved') {
      return res.status(400).json({ message: 'Postmortem can only be added to resolved issues' });
    }

    const {
      summary,
      rootCause,
      impact,
      timeline,
      lessonsLearned,
      preventiveMeasures,
      isPublished
    } = req.body;

    issue.postmortem = {
      summary: summary || issue.postmortem?.summary,
      rootCause: rootCause || issue.postmortem?.rootCause,
      impact: impact || issue.postmortem?.impact,
      timeline: timeline || issue.postmortem?.timeline,
      lessonsLearned: lessonsLearned || issue.postmortem?.lessonsLearned,
      preventiveMeasures: preventiveMeasures || issue.postmortem?.preventiveMeasures,
      isPublished: isPublished !== undefined ? isPublished : issue.postmortem?.isPublished,
      createdBy: req.user._id,
      createdAt: issue.postmortem?.createdAt || new Date()
    };

    await issue.save();

    await issue.populate('createdBy', 'name email avatar');
    await issue.populate('resolvedBy', 'name email avatar');
    await issue.populate('postmortem.createdBy', 'name email avatar');
    await issue.populate('updates.author', 'name email avatar');

    res.json(issue);
  } catch (error) {
    console.error('Error updating postmortem:', error);
    res.status(500).json({ message: 'Error updating postmortem', error: error.message });
  }
};

// @desc    Get enhanced stats for status page
// @route   GET /api/issues/enhanced-stats
// @access  Public
exports.getEnhancedStats = async (req, res) => {
  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    // Basic counts
    const totalActive = await Issue.countDocuments({ status: { $ne: 'resolved' } });
    const totalResolved = await Issue.countDocuments({ status: 'resolved' });

    // Issues in the last 30 days
    const last30DaysIssues = await Issue.countDocuments({
      createdAt: { $gte: thirtyDaysAgo }
    });

    // Resolved in last 30 days
    const resolvedLast30Days = await Issue.countDocuments({
      status: 'resolved',
      resolvedAt: { $gte: thirtyDaysAgo }
    });

    // Average resolution time (for resolved issues in last 90 days)
    const resolvedIssues = await Issue.find({
      status: 'resolved',
      resolvedAt: { $gte: ninetyDaysAgo }
    }).select('createdAt resolvedAt');

    let avgResolutionMinutes = 0;
    if (resolvedIssues.length > 0) {
      const totalMinutes = resolvedIssues.reduce((acc, issue) => {
        const created = new Date(issue.createdAt);
        const resolved = new Date(issue.resolvedAt);
        return acc + (resolved - created) / 60000;
      }, 0);
      avgResolutionMinutes = Math.round(totalMinutes / resolvedIssues.length);
    }

    // Severity breakdown of active issues
    const severityBreakdown = await Issue.aggregate([
      { $match: { status: { $ne: 'resolved' } } },
      { $group: { _id: '$severity', count: { $sum: 1 } } }
    ]);

    // Calculate uptime (simplified - based on issue duration)
    const allIssuesLast90Days = await Issue.find({
      createdAt: { $gte: ninetyDaysAgo }
    }).select('createdAt resolvedAt severity');

    const totalMinutes90Days = 90 * 24 * 60;
    let downtimeMinutes = 0;

    allIssuesLast90Days.forEach(issue => {
      const start = Math.max(new Date(issue.createdAt).getTime(), ninetyDaysAgo.getTime());
      const end = issue.resolvedAt
        ? Math.min(new Date(issue.resolvedAt).getTime(), now.getTime())
        : now.getTime();

      // Weight by severity
      const weight = issue.severity === 'critical' ? 1 : issue.severity === 'major' ? 0.5 : 0.1;
      downtimeMinutes += ((end - start) / 60000) * weight;
    });

    const uptimePercent = Math.max(0, ((totalMinutes90Days - downtimeMinutes) / totalMinutes90Days) * 100).toFixed(3);

    res.json({
      totalActive,
      totalResolved,
      last30Days: {
        created: last30DaysIssues,
        resolved: resolvedLast30Days
      },
      avgResolutionTime: {
        minutes: avgResolutionMinutes,
        formatted: formatDuration(avgResolutionMinutes)
      },
      severityBreakdown: severityBreakdown.reduce((acc, item) => {
        acc[item._id] = item.count;
        return acc;
      }, {}),
      uptime: {
        percent: parseFloat(uptimePercent),
        period: '90 days'
      }
    });
  } catch (error) {
    console.error('Error fetching enhanced stats:', error);
    res.status(500).json({ message: 'Error fetching enhanced stats', error: error.message });
  }
};

// Helper to format duration
function formatDuration(minutes) {
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 1440) return `${Math.round(minutes / 60)}h`;
  return `${Math.round(minutes / 1440)}d`;
}

// @desc    Get issues by date range (for calendar view)
// @route   GET /api/issues/calendar
// @access  Public
exports.getCalendarIssues = async (req, res) => {
  try {
    const { start, end } = req.query;

    const startDate = start ? new Date(start) : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const endDate = end ? new Date(end) : new Date();

    const issues = await Issue.find({
      $or: [
        { createdAt: { $gte: startDate, $lte: endDate } },
        { resolvedAt: { $gte: startDate, $lte: endDate } }
      ]
    })
      .select('title status severity createdAt resolvedAt')
      .sort({ createdAt: -1 });

    // Group by date
    const byDate = {};
    issues.forEach(issue => {
      const dateKey = new Date(issue.createdAt).toISOString().split('T')[0];
      if (!byDate[dateKey]) {
        byDate[dateKey] = [];
      }
      byDate[dateKey].push(issue);
    });

    res.json({
      issues,
      byDate,
      range: { start: startDate, end: endDate }
    });
  } catch (error) {
    console.error('Error fetching calendar issues:', error);
    res.status(500).json({ message: 'Error fetching calendar issues', error: error.message });
  }
};
