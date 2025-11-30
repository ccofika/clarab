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
