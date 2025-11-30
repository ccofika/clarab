const Maintenance = require('../models/Maintenance');
const SystemComponent = require('../models/SystemComponent');

// @desc    Get all maintenance (with filters)
// @route   GET /api/maintenance
// @access  Public
exports.getMaintenance = async (req, res) => {
  try {
    const { status, type } = req.query;

    let maintenance;

    if (type === 'upcoming') {
      maintenance = await Maintenance.getUpcoming(10);
    } else if (type === 'active') {
      maintenance = await Maintenance.getActive();
    } else if (type === 'past') {
      maintenance = await Maintenance.getPast(20);
    } else {
      // Get all
      const query = {};
      if (status) query.status = status;

      maintenance = await Maintenance.find(query)
        .sort({ scheduledStart: -1 })
        .populate('affectedComponents', 'name')
        .populate('createdBy', 'name email')
        .populate('updates.author', 'name email');
    }

    res.json(maintenance);
  } catch (error) {
    console.error('Error fetching maintenance:', error);
    res.status(500).json({ message: 'Error fetching maintenance', error: error.message });
  }
};

// @desc    Get single maintenance
// @route   GET /api/maintenance/:id
// @access  Public
exports.getMaintenanceById = async (req, res) => {
  try {
    const maintenance = await Maintenance.findById(req.params.id)
      .populate('affectedComponents', 'name description')
      .populate('createdBy', 'name email')
      .populate('updates.author', 'name email');

    if (!maintenance) {
      return res.status(404).json({ message: 'Maintenance not found' });
    }

    res.json(maintenance);
  } catch (error) {
    console.error('Error fetching maintenance:', error);
    res.status(500).json({ message: 'Error fetching maintenance', error: error.message });
  }
};

// @desc    Create maintenance
// @route   POST /api/maintenance
// @access  Private (Admin, Developer only)
exports.createMaintenance = async (req, res) => {
  try {
    const {
      title,
      description,
      impact,
      scheduledStart,
      scheduledEnd,
      affectedComponents,
      notifySubscribers
    } = req.body;

    // Validate dates
    const start = new Date(scheduledStart);
    const end = new Date(scheduledEnd);

    if (end <= start) {
      return res.status(400).json({ message: 'End time must be after start time' });
    }

    const maintenance = await Maintenance.create({
      title,
      description,
      impact: impact || 'minor',
      scheduledStart: start,
      scheduledEnd: end,
      affectedComponents: affectedComponents || [],
      notifySubscribers: notifySubscribers !== false,
      createdBy: req.user._id
    });

    const populated = await Maintenance.findById(maintenance._id)
      .populate('affectedComponents', 'name')
      .populate('createdBy', 'name email');

    // TODO: Send notifications to subscribers if notifySubscribers is true

    res.status(201).json(populated);
  } catch (error) {
    console.error('Error creating maintenance:', error);
    res.status(500).json({ message: 'Error creating maintenance', error: error.message });
  }
};

// @desc    Update maintenance
// @route   PUT /api/maintenance/:id
// @access  Private (Admin, Developer only)
exports.updateMaintenance = async (req, res) => {
  try {
    const {
      title,
      description,
      impact,
      scheduledStart,
      scheduledEnd,
      affectedComponents
    } = req.body;

    const maintenance = await Maintenance.findById(req.params.id);

    if (!maintenance) {
      return res.status(404).json({ message: 'Maintenance not found' });
    }

    if (title) maintenance.title = title;
    if (description) maintenance.description = description;
    if (impact) maintenance.impact = impact;
    if (scheduledStart) maintenance.scheduledStart = new Date(scheduledStart);
    if (scheduledEnd) maintenance.scheduledEnd = new Date(scheduledEnd);
    if (affectedComponents) maintenance.affectedComponents = affectedComponents;

    await maintenance.save();

    const populated = await Maintenance.findById(maintenance._id)
      .populate('affectedComponents', 'name')
      .populate('createdBy', 'name email')
      .populate('updates.author', 'name email');

    res.json(populated);
  } catch (error) {
    console.error('Error updating maintenance:', error);
    res.status(500).json({ message: 'Error updating maintenance', error: error.message });
  }
};

// @desc    Update maintenance status
// @route   PUT /api/maintenance/:id/status
// @access  Private (Admin, Developer only)
exports.updateMaintenanceStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['scheduled', 'in_progress', 'completed', 'cancelled'];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    const maintenance = await Maintenance.findById(req.params.id);

    if (!maintenance) {
      return res.status(404).json({ message: 'Maintenance not found' });
    }

    maintenance.status = status;

    if (status === 'in_progress') {
      maintenance.actualStart = new Date();
    } else if (status === 'completed' || status === 'cancelled') {
      maintenance.actualEnd = new Date();
    }

    await maintenance.save();

    const populated = await Maintenance.findById(maintenance._id)
      .populate('affectedComponents', 'name')
      .populate('createdBy', 'name email')
      .populate('updates.author', 'name email');

    res.json(populated);
  } catch (error) {
    console.error('Error updating maintenance status:', error);
    res.status(500).json({ message: 'Error updating maintenance status', error: error.message });
  }
};

// @desc    Add update to maintenance
// @route   POST /api/maintenance/:id/updates
// @access  Private (Admin, Developer only)
exports.addMaintenanceUpdate = async (req, res) => {
  try {
    const { message } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({ message: 'Update message is required' });
    }

    const maintenance = await Maintenance.findById(req.params.id);

    if (!maintenance) {
      return res.status(404).json({ message: 'Maintenance not found' });
    }

    maintenance.updates.push({
      message: message.trim(),
      author: req.user._id
    });

    await maintenance.save();

    const populated = await Maintenance.findById(maintenance._id)
      .populate('affectedComponents', 'name')
      .populate('createdBy', 'name email')
      .populate('updates.author', 'name email');

    res.json(populated);
  } catch (error) {
    console.error('Error adding maintenance update:', error);
    res.status(500).json({ message: 'Error adding update', error: error.message });
  }
};

// @desc    Delete maintenance
// @route   DELETE /api/maintenance/:id
// @access  Private (Admin only)
exports.deleteMaintenance = async (req, res) => {
  try {
    const maintenance = await Maintenance.findByIdAndDelete(req.params.id);

    if (!maintenance) {
      return res.status(404).json({ message: 'Maintenance not found' });
    }

    res.json({ message: 'Maintenance deleted successfully' });
  } catch (error) {
    console.error('Error deleting maintenance:', error);
    res.status(500).json({ message: 'Error deleting maintenance', error: error.message });
  }
};

// @desc    Get maintenance summary for status page
// @route   GET /api/maintenance/summary
// @access  Public
exports.getMaintenanceSummary = async (req, res) => {
  try {
    const [upcoming, active] = await Promise.all([
      Maintenance.getUpcoming(3),
      Maintenance.getActive()
    ]);

    res.json({
      upcoming,
      active,
      hasUpcoming: upcoming.length > 0,
      hasActive: active.length > 0
    });
  } catch (error) {
    console.error('Error fetching maintenance summary:', error);
    res.status(500).json({ message: 'Error fetching summary', error: error.message });
  }
};
