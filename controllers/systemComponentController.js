const SystemComponent = require('../models/SystemComponent');
const Issue = require('../models/Issue');

// @desc    Get all system components (grouped)
// @route   GET /api/system-components
// @access  Public
exports.getComponents = async (req, res) => {
  try {
    const grouped = await SystemComponent.getGroupedComponents();
    const overallStatus = await SystemComponent.getOverallStatus();

    res.json({
      overallStatus,
      groups: grouped
    });
  } catch (error) {
    console.error('Error fetching components:', error);
    res.status(500).json({ message: 'Error fetching components', error: error.message });
  }
};

// @desc    Get single component
// @route   GET /api/system-components/:id
// @access  Public
exports.getComponent = async (req, res) => {
  try {
    const component = await SystemComponent.findById(req.params.id)
      .populate('activeIssues', 'title severity status createdAt');

    if (!component) {
      return res.status(404).json({ message: 'Component not found' });
    }

    res.json(component);
  } catch (error) {
    console.error('Error fetching component:', error);
    res.status(500).json({ message: 'Error fetching component', error: error.message });
  }
};

// @desc    Create component
// @route   POST /api/system-components
// @access  Private (Admin, Developer only)
exports.createComponent = async (req, res) => {
  try {
    const { name, description, group, order } = req.body;

    const component = await SystemComponent.create({
      name,
      description,
      group: group || 'Core Services',
      order: order || 0
    });

    res.status(201).json(component);
  } catch (error) {
    console.error('Error creating component:', error);
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Component with this name already exists' });
    }
    res.status(500).json({ message: 'Error creating component', error: error.message });
  }
};

// @desc    Update component
// @route   PUT /api/system-components/:id
// @access  Private (Admin, Developer only)
exports.updateComponent = async (req, res) => {
  try {
    const { name, description, group, order, isVisible } = req.body;

    const component = await SystemComponent.findByIdAndUpdate(
      req.params.id,
      { name, description, group, order, isVisible },
      { new: true, runValidators: true }
    );

    if (!component) {
      return res.status(404).json({ message: 'Component not found' });
    }

    res.json(component);
  } catch (error) {
    console.error('Error updating component:', error);
    res.status(500).json({ message: 'Error updating component', error: error.message });
  }
};

// @desc    Update component status
// @route   PUT /api/system-components/:id/status
// @access  Private (Admin, Developer only)
exports.updateComponentStatus = async (req, res) => {
  try {
    const { status, reason } = req.body;

    const component = await SystemComponent.findById(req.params.id);

    if (!component) {
      return res.status(404).json({ message: 'Component not found' });
    }

    await component.updateStatus(status, req.user._id, reason);

    res.json(component);
  } catch (error) {
    console.error('Error updating component status:', error);
    res.status(500).json({ message: 'Error updating component status', error: error.message });
  }
};

// @desc    Delete component
// @route   DELETE /api/system-components/:id
// @access  Private (Admin only)
exports.deleteComponent = async (req, res) => {
  try {
    const component = await SystemComponent.findByIdAndDelete(req.params.id);

    if (!component) {
      return res.status(404).json({ message: 'Component not found' });
    }

    res.json({ message: 'Component deleted successfully' });
  } catch (error) {
    console.error('Error deleting component:', error);
    res.status(500).json({ message: 'Error deleting component', error: error.message });
  }
};

// @desc    Get 90-day uptime history
// @route   GET /api/system-components/uptime-history
// @access  Public
exports.getUptimeHistory = async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 90;
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Get all issues in the date range
    const issues = await Issue.find({
      createdAt: { $gte: startDate, $lte: endDate }
    }).select('createdAt resolvedAt severity status');

    // Build day-by-day history
    const history = [];
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);

      const nextDate = new Date(date);
      nextDate.setDate(nextDate.getDate() + 1);

      // Find issues active on this day
      const dayIssues = issues.filter(issue => {
        const created = new Date(issue.createdAt);
        const resolved = issue.resolvedAt ? new Date(issue.resolvedAt) : new Date();
        return created < nextDate && resolved >= date;
      });

      // Calculate status for the day
      let status = 'operational';
      let downtimeMinutes = 0;

      if (dayIssues.length > 0) {
        const hasCritical = dayIssues.some(i => i.severity === 'critical');
        const hasMajor = dayIssues.some(i => i.severity === 'major');

        if (hasCritical) status = 'major_outage';
        else if (hasMajor) status = 'partial_outage';
        else status = 'degraded';

        // Estimate downtime (simplified)
        dayIssues.forEach(issue => {
          const start = Math.max(new Date(issue.createdAt).getTime(), date.getTime());
          const end = Math.min(
            issue.resolvedAt ? new Date(issue.resolvedAt).getTime() : Date.now(),
            nextDate.getTime()
          );
          downtimeMinutes += (end - start) / 60000;
        });
      }

      history.push({
        date: date.toISOString().split('T')[0],
        status,
        issueCount: dayIssues.length,
        downtimeMinutes: Math.round(downtimeMinutes),
        uptimePercent: Math.max(0, 100 - (downtimeMinutes / 1440 * 100)).toFixed(2)
      });
    }

    // Calculate overall uptime
    const totalMinutes = days * 24 * 60;
    const totalDowntime = history.reduce((acc, day) => acc + day.downtimeMinutes, 0);
    const overallUptime = ((totalMinutes - totalDowntime) / totalMinutes * 100).toFixed(3);

    res.json({
      days,
      overallUptime,
      history
    });
  } catch (error) {
    console.error('Error fetching uptime history:', error);
    res.status(500).json({ message: 'Error fetching uptime history', error: error.message });
  }
};

// @desc    Seed default components
// @route   POST /api/system-components/seed
// @access  Private (Admin only)
exports.seedComponents = async (req, res) => {
  try {
    const existingCount = await SystemComponent.countDocuments();
    if (existingCount > 0) {
      return res.status(400).json({ message: 'Components already exist' });
    }

    const defaultComponents = [
      { name: 'Web Application', description: 'Main web application interface', group: 'Core Services', order: 1 },
      { name: 'API', description: 'REST API services', group: 'Core Services', order: 2 },
      { name: 'Database', description: 'Database services', group: 'Core Services', order: 3 },
      { name: 'Authentication', description: 'Login and authentication services', group: 'Core Services', order: 4 },
      { name: 'File Storage', description: 'File upload and storage', group: 'Infrastructure', order: 5 },
      { name: 'Email Service', description: 'Email notifications', group: 'Infrastructure', order: 6 },
      { name: 'Real-time Updates', description: 'WebSocket connections', group: 'Infrastructure', order: 7 },
    ];

    await SystemComponent.insertMany(defaultComponents);

    res.status(201).json({ message: 'Default components created', count: defaultComponents.length });
  } catch (error) {
    console.error('Error seeding components:', error);
    res.status(500).json({ message: 'Error seeding components', error: error.message });
  }
};
