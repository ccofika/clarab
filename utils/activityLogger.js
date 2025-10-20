const ActivityLog = require('../models/ActivityLog');

/**
 * Log an activity to the database
 * @param {Object} options - Logging options
 * @param {string} options.level - Log level (info, warn, error)
 * @param {string} options.message - Log message
 * @param {string} options.module - Module/controller name
 * @param {Object} options.user - User object or user ID
 * @param {Object} options.metadata - Additional metadata
 * @param {Object} options.req - Express request object (for IP and user agent)
 */
const logActivity = async ({
  level = 'info',
  message,
  module,
  user = null,
  metadata = {},
  req = null
}) => {
  try {
    const logData = {
      level,
      message,
      module,
      metadata
    };

    // Extract user ID if user object is passed
    if (user) {
      logData.user = typeof user === 'string' ? user : user._id || user.id;
    }

    // Extract IP and user agent from request if available
    if (req) {
      logData.ip = req.ip || req.connection?.remoteAddress || null;
      logData.userAgent = req.get('user-agent') || null;
    }

    await ActivityLog.create(logData);
  } catch (error) {
    // Don't throw error to prevent disrupting the main application flow
    console.error('Failed to log activity:', error.message);
  }
};

/**
 * Get recent activity logs
 * @param {number} limit - Number of logs to retrieve
 * @param {string} level - Filter by level (optional)
 * @returns {Promise<Array>} - Array of activity logs
 */
const getRecentLogs = async (limit = 100, level = null) => {
  try {
    const query = level ? { level } : {};
    return await ActivityLog.find(query)
      .populate('user', 'name email')
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
  } catch (error) {
    console.error('Failed to retrieve logs:', error.message);
    return [];
  }
};

/**
 * Get logs for a specific user
 * @param {string} userId - User ID
 * @param {number} limit - Number of logs to retrieve
 * @returns {Promise<Array>} - Array of activity logs
 */
const getUserLogs = async (userId, limit = 50) => {
  try {
    return await ActivityLog.find({ user: userId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
  } catch (error) {
    console.error('Failed to retrieve user logs:', error.message);
    return [];
  }
};

/**
 * Get logs statistics
 * @returns {Promise<Object>} - Log statistics
 */
const getLogStats = async () => {
  try {
    const [total, errors, warnings, info] = await Promise.all([
      ActivityLog.countDocuments(),
      ActivityLog.countDocuments({ level: 'error' }),
      ActivityLog.countDocuments({ level: 'warn' }),
      ActivityLog.countDocuments({ level: 'info' })
    ]);

    return { total, errors, warnings, info };
  } catch (error) {
    console.error('Failed to retrieve log stats:', error.message);
    return { total: 0, errors: 0, warnings: 0, info: 0 };
  }
};

module.exports = {
  logActivity,
  getRecentLogs,
  getUserLogs,
  getLogStats
};
