const User = require('../models/User');
const Workspace = require('../models/Workspace');
const Canvas = require('../models/Canvas');
const CanvasElement = require('../models/CanvasElement');
const ActivityLog = require('../models/ActivityLog');
const LoginAttempt = require('../models/LoginAttempt');
const RevokedToken = require('../models/RevokedToken');
const RefreshToken = require('../models/RefreshToken');
const SecuritySettings = require('../models/SecuritySettings');
const mongoose = require('mongoose');
const os = require('os');

// @desc    Get system metrics
// @route   GET /api/developer/metrics
// @access  Private (Developer/Admin only)
exports.getSystemMetrics = async (req, res) => {
  try {
    console.log('📊 Developer accessing system metrics');

    // Count all collections
    const usersCount = await User.countDocuments();
    const workspacesCount = await Workspace.countDocuments();
    const canvasCount = await Canvas.countDocuments();
    const canvasElementsCount = await CanvasElement.countDocuments();

    // Count by role
    const adminCount = await User.countDocuments({ role: 'admin' });
    const developerCount = await User.countDocuments({ role: 'developer' });
    const userCount = await User.countDocuments({ role: 'user' });

    // Workspace stats
    const personalWorkspacesCount = await Workspace.countDocuments({ type: 'personal' });
    const announcementsCount = await Workspace.countDocuments({ type: 'announcements' });

    // System uptime
    const uptime = process.uptime();
    const uptimeFormatted = formatUptime(uptime);

    // Memory usage
    const memoryUsage = process.memoryUsage();
    const memoryUsageMB = {
      rss: (memoryUsage.rss / 1024 / 1024).toFixed(2),
      heapTotal: (memoryUsage.heapTotal / 1024 / 1024).toFixed(2),
      heapUsed: (memoryUsage.heapUsed / 1024 / 1024).toFixed(2),
      external: (memoryUsage.external / 1024 / 1024).toFixed(2)
    };

    // CPU usage
    const cpuUsage = process.cpuUsage();

    res.json({
      timestamp: new Date().toISOString(),
      system: {
        uptime: uptimeFormatted,
        uptimeSeconds: Math.floor(uptime),
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        hostname: os.hostname(),
        totalMemory: (os.totalmem() / 1024 / 1024 / 1024).toFixed(2) + ' GB',
        freeMemory: (os.freemem() / 1024 / 1024 / 1024).toFixed(2) + ' GB'
      },
      process: {
        memoryUsageMB,
        cpuUsage: {
          user: (cpuUsage.user / 1000000).toFixed(2) + 's',
          system: (cpuUsage.system / 1000000).toFixed(2) + 's'
        },
        pid: process.pid
      },
      database: {
        users: {
          total: usersCount,
          admins: adminCount,
          developers: developerCount,
          regularUsers: userCount
        },
        workspaces: {
          total: workspacesCount,
          personal: personalWorkspacesCount,
          announcements: announcementsCount
        },
        canvas: {
          total: canvasCount,
          elements: canvasElementsCount
        }
      }
    });
  } catch (error) {
    console.error('❌ Error getting system metrics:', error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get health check
// @route   GET /api/developer/health
// @access  Private (Developer/Admin only)
exports.getHealthCheck = async (req, res) => {
  try {
    console.log('🏥 Developer accessing health check');

    // Check database connection
    const dbStatus = mongoose.connection.readyState;
    const dbStatusMap = {
      0: 'disconnected',
      1: 'connected',
      2: 'connecting',
      3: 'disconnecting'
    };

    // Ping database
    let dbResponseTime = 0;
    let dbPingSuccess = false;
    try {
      const startTime = Date.now();
      await mongoose.connection.db.admin().ping();
      dbResponseTime = Date.now() - startTime;
      dbPingSuccess = true;
    } catch (error) {
      console.error('Database ping failed:', error);
    }

    const health = {
      status: dbPingSuccess ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: {
        status: dbStatusMap[dbStatus],
        connected: dbStatus === 1,
        responseTime: dbResponseTime + 'ms',
        pingSuccess: dbPingSuccess
      },
      memory: {
        heapUsed: (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2) + ' MB',
        heapTotal: (process.memoryUsage().heapTotal / 1024 / 1024).toFixed(2) + ' MB'
      }
    };

    const statusCode = health.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json(health);
  } catch (error) {
    console.error('❌ Error in health check:', error);
    res.status(503).json({
      status: 'unhealthy',
      message: error.message
    });
  }
};

// @desc    Get all users (read-only, safe fields)
// @route   GET /api/developer/users
// @access  Private (Developer/Admin only)
exports.getAllUsersForDeveloper = async (req, res) => {
  try {
    console.log('👥 Developer accessing all users');

    const users = await User.find({})
      .select('_id name email role createdAt updatedAt isFirstLogin')
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      count: users.length,
      users: users.map(user => ({
        ...user,
        _note: 'Read-only access for developer inspection'
      }))
    });
  } catch (error) {
    console.error('❌ Error getting users for developer:', error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get all workspaces (read-only)
// @route   GET /api/developer/workspaces
// @access  Private (Developer/Admin only)
exports.getAllWorkspacesForDeveloper = async (req, res) => {
  try {
    console.log('📁 Developer accessing all workspaces');

    const workspaces = await Workspace.find({})
      .populate('owner', 'name email role')
      .populate('members.user', 'name email role')
      .populate('invitedMembers', 'name email role')
      .sort({ type: -1, createdAt: -1 })
      .lean();

    // Add element counts for each workspace
    const workspacesWithStats = await Promise.all(
      workspaces.map(async (workspace) => {
        const canvas = await Canvas.findOne({ workspace: workspace._id });
        let elementCount = 0;
        if (canvas) {
          elementCount = await CanvasElement.countDocuments({ canvas: canvas._id });
        }

        return {
          ...workspace,
          stats: {
            memberCount: workspace.members?.length || 0,
            invitedCount: workspace.invitedMembers?.length || 0,
            elementCount
          },
          _note: 'Read-only access for developer inspection'
        };
      })
    );

    res.json({
      count: workspacesWithStats.length,
      workspaces: workspacesWithStats
    });
  } catch (error) {
    console.error('❌ Error getting workspaces for developer:', error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get system logs (real activity logs from database)
// @route   GET /api/developer/logs
// @access  Private (Developer/Admin only)
exports.getSystemLogs = async (req, res) => {
  try {
    console.log('📋 Developer accessing system logs');

    // Pagination
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(parseInt(req.query.limit) || 50, 200); // Default 50, max 200
    const skip = (page - 1) * limit;

    // Filters
    const level = req.query.level; // Filter by level (info, warn, error)
    const module = req.query.module; // Filter by module
    const userId = req.query.userId; // Filter by user
    const search = req.query.search; // Search in message
    const startDate = req.query.startDate; // Date range start
    const endDate = req.query.endDate; // Date range end

    // Build query
    const query = {};

    if (level && ['info', 'warn', 'error'].includes(level)) {
      query.level = level;
    }

    if (module) {
      query.module = module;
    }

    if (userId) {
      query.user = userId;
    }

    if (search) {
      query.message = { $regex: search, $options: 'i' }; // Case-insensitive search
    }

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    // Fetch real logs from database with pagination
    const [logs, totalCount] = await Promise.all([
      ActivityLog.find(query)
        .populate('user', 'name email role')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      ActivityLog.countDocuments(query)
    ]);

    // Format logs for frontend
    const formattedLogs = logs.map(log => ({
      _id: log._id,
      timestamp: log.createdAt,
      level: log.level,
      message: log.message,
      module: log.module,
      metadata: {
        ...log.metadata,
        ...(log.user ? {
          userId: log.user._id,
          userName: log.user.name,
          userEmail: log.user.email,
          userRole: log.user.role
        } : {}),
        ...(log.ip ? { ip: log.ip } : {}),
        ...(log.userAgent ? { userAgent: log.userAgent } : {})
      }
    }));

    // Get log statistics (for all logs, not just filtered)
    const [totalLogs, errorCount, warnCount, infoCount, filteredErrorCount, filteredWarnCount, filteredInfoCount] = await Promise.all([
      ActivityLog.countDocuments(),
      ActivityLog.countDocuments({ level: 'error' }),
      ActivityLog.countDocuments({ level: 'warn' }),
      ActivityLog.countDocuments({ level: 'info' }),
      ActivityLog.countDocuments({ ...query, level: 'error' }),
      ActivityLog.countDocuments({ ...query, level: 'warn' }),
      ActivityLog.countDocuments({ ...query, level: 'info' })
    ]);

    // Get unique modules for filter dropdown
    const modules = await ActivityLog.distinct('module');

    res.json({
      logs: formattedLogs,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalCount / limit),
        totalCount,
        limit,
        hasNextPage: page < Math.ceil(totalCount / limit),
        hasPrevPage: page > 1
      },
      stats: {
        total: totalLogs,
        errors: errorCount,
        warnings: warnCount,
        info: infoCount,
        filtered: {
          total: totalCount,
          errors: filteredErrorCount,
          warnings: filteredWarnCount,
          info: filteredInfoCount
        }
      },
      filters: {
        availableModules: modules.sort(),
        appliedFilters: {
          level,
          module,
          userId,
          search,
          startDate,
          endDate
        }
      }
    });
  } catch (error) {
    console.error('❌ Error getting system logs:', error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get database statistics
// @route   GET /api/developer/database-stats
// @access  Private (Developer/Admin only)
exports.getDatabaseStats = async (req, res) => {
  try {
    console.log('💾 Developer accessing database stats');

    // Get database stats from MongoDB
    const dbStats = await mongoose.connection.db.stats();

    // Get collection stats using collStats command
    const collections = await mongoose.connection.db.listCollections().toArray();
    const collectionStats = await Promise.all(
      collections.map(async (col) => {
        try {
          // Use MongoDB's collStats command instead of .stats() method
          const stats = await mongoose.connection.db.command({ collStats: col.name });
          return {
            name: col.name,
            count: stats.count || 0,
            size: stats.size ? (stats.size / 1024).toFixed(2) + ' KB' : '0 KB',
            avgObjSize: stats.avgObjSize ? (stats.avgObjSize / 1024).toFixed(2) + ' KB' : '0 KB',
            indexes: stats.nindexes || 0
          };
        } catch (err) {
          console.warn(`Warning: Could not get stats for collection ${col.name}:`, err.message);
          return {
            name: col.name,
            count: 0,
            size: '0 KB',
            avgObjSize: '0 KB',
            indexes: 0
          };
        }
      })
    );

    res.json({
      database: {
        name: mongoose.connection.name,
        collections: dbStats.collections,
        dataSize: (dbStats.dataSize / 1024 / 1024).toFixed(2) + ' MB',
        storageSize: (dbStats.storageSize / 1024 / 1024).toFixed(2) + ' MB',
        indexSize: (dbStats.indexSize / 1024 / 1024).toFixed(2) + ' MB',
        totalSize: (dbStats.totalSize / 1024 / 1024).toFixed(2) + ' MB'
      },
      collections: collectionStats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Error getting database stats:', error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get login attempts (for security monitoring)
// @route   GET /api/developer/login-attempts
// @access  Private (Developer/Admin only)
exports.getLoginAttempts = async (req, res) => {
  try {
    console.log('🔐 Developer accessing login attempts');

    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const skip = (page - 1) * limit;

    // Filters
    const success = req.query.success; // true/false filter
    const email = req.query.email; // Filter by email
    const ipAddress = req.query.ipAddress; // Filter by IP

    // Build query
    const query = {};
    if (success !== undefined) {
      query.success = success === 'true';
    }
    if (email) {
      query.email = { $regex: email, $options: 'i' };
    }
    if (ipAddress) {
      query.ipAddress = { $regex: ipAddress, $options: 'i' };
    }

    // Fetch login attempts
    const [attempts, totalCount] = await Promise.all([
      LoginAttempt.find(query)
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      LoginAttempt.countDocuments(query)
    ]);

    // Get statistics
    const [totalAttempts, successCount, failedCount, last24hFailed] = await Promise.all([
      LoginAttempt.countDocuments(),
      LoginAttempt.countDocuments({ success: true }),
      LoginAttempt.countDocuments({ success: false }),
      LoginAttempt.countDocuments({
        success: false,
        timestamp: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
      })
    ]);

    res.json({
      attempts,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalCount / limit),
        totalCount,
        limit,
        hasNextPage: page < Math.ceil(totalCount / limit),
        hasPrevPage: page > 1
      },
      stats: {
        total: totalAttempts,
        successful: successCount,
        failed: failedCount,
        failedLast24h: last24hFailed,
        successRate: totalAttempts > 0 ? ((successCount / totalAttempts) * 100).toFixed(2) + '%' : '0%'
      },
      filters: {
        appliedFilters: {
          success,
          email,
          ipAddress
        }
      }
    });
  } catch (error) {
    console.error('❌ Error getting login attempts:', error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get suspicious activity (multiple failed attempts from same IP)
// @route   GET /api/developer/suspicious-activity
// @access  Private (Developer/Admin only)
exports.getSuspiciousActivity = async (req, res) => {
  try {
    console.log('🚨 Developer accessing suspicious activity');

    const threshold = parseInt(req.query.threshold) || 10;
    const timeWindowMs = parseInt(req.query.timeWindow) || 3600000; // Default 1 hour

    const suspiciousIPs = await LoginAttempt.getSuspiciousActivity(threshold, timeWindowMs);

    res.json({
      timeWindow: `${timeWindowMs / 1000 / 60} minutes`,
      threshold: `${threshold} failed attempts`,
      suspiciousActivity: suspiciousIPs,
      count: suspiciousIPs.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Error getting suspicious activity:', error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get locked accounts
// @route   GET /api/developer/locked-accounts
// @access  Private (Developer/Admin only)
exports.getLockedAccounts = async (req, res) => {
  try {
    console.log('🔒 Developer accessing locked accounts');

    // Find all users with lockUntil set and in the future
    const lockedUsers = await User.find({
      lockUntil: { $exists: true, $gt: new Date() }
    })
      .select('_id name email role loginAttempts lockUntil')
      .sort({ lockUntil: 1 })
      .lean();

    // Add time remaining for each locked account
    const lockedAccountsWithTimeRemaining = lockedUsers.map(user => ({
      ...user,
      lockTimeRemaining: Math.ceil((user.lockUntil - Date.now()) / 1000 / 60), // minutes
      lockUntilFormatted: new Date(user.lockUntil).toISOString()
    }));

    res.json({
      count: lockedAccountsWithTimeRemaining.length,
      lockedAccounts: lockedAccountsWithTimeRemaining,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Error getting locked accounts:', error);
    res.status(500).json({ message: error.message });
  }
};

// Helper function to format uptime
function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  parts.push(`${secs}s`);

  return parts.join(' ');
}

/**
 * Security Dashboard Controllers
 */

// @desc    Get security dashboard overview
// @route   GET /api/developer/security/dashboard
// @access  Private (Developer/Admin only)
exports.getSecurityDashboard = async (req, res) => {
  try {
    console.log('🔒 Developer accessing security dashboard');

    // Token Statistics
    const [
      totalRevokedTokens,
      revokedLast24h,
      revokedByLogout,
      revokedByPasswordChange,
      totalActiveRefreshTokens,
      usersWithTokenValidAfter
    ] = await Promise.all([
      RevokedToken.countDocuments(),
      RevokedToken.countDocuments({
        createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
      }),
      RevokedToken.countDocuments({ reason: 'logout' }),
      RevokedToken.countDocuments({ reason: 'password_changed' }),
      RefreshToken.countDocuments({ isRevoked: false, expiresAt: { $gt: new Date() } }),
      User.countDocuments({ tokenValidAfter: { $exists: true, $ne: null } })
    ]);

    // Security Events (last 7 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [
      failedLogins,
      successfulLogins,
      accountLockouts,
      suspiciousActivity
    ] = await Promise.all([
      LoginAttempt.countDocuments({
        success: false,
        timestamp: { $gte: sevenDaysAgo }
      }),
      LoginAttempt.countDocuments({
        success: true,
        timestamp: { $gte: sevenDaysAgo }
      }),
      ActivityLog.countDocuments({
        level: 'error',
        message: /Account locked/i,
        createdAt: { $gte: sevenDaysAgo }
      }),
      LoginAttempt.getSuspiciousActivity(10, 7 * 24 * 60 * 60 * 1000)
    ]);

    // Recent Revocations (last 10)
    const recentRevocations = await RevokedToken.find()
      .populate('user', 'name email role')
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    // Users with most revoked tokens
    const topRevokedUsers = await RevokedToken.aggregate([
      {
        $group: {
          _id: '$user',
          count: { $sum: 1 },
          reasons: { $push: '$reason' }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 5 }
    ]);

    const topRevokedUsersPopulated = await User.populate(topRevokedUsers, {
      path: '_id',
      select: 'name email role'
    });

    res.json({
      timestamp: new Date().toISOString(),
      tokenStats: {
        revoked: {
          total: totalRevokedTokens,
          last24h: revokedLast24h,
          byLogout: revokedByLogout,
          byPasswordChange: revokedByPasswordChange
        },
        active: {
          refreshTokens: totalActiveRefreshTokens
        },
        usersWithInvalidatedTokens: usersWithTokenValidAfter
      },
      securityEvents: {
        last7Days: {
          failedLogins,
          successfulLogins,
          accountLockouts,
          suspiciousIPs: suspiciousActivity.length
        },
        loginSuccessRate: successfulLogins + failedLogins > 0
          ? ((successfulLogins / (successfulLogins + failedLogins)) * 100).toFixed(2) + '%'
          : '100%'
      },
      recentRevocations: recentRevocations.map(token => ({
        jti: token.jti,
        user: token.user ? {
          _id: token.user._id,
          name: token.user.name,
          email: token.user.email
        } : null,
        reason: token.reason,
        revokedAt: token.createdAt,
        revokedByIp: token.revokedByIp
      })),
      topRevokedUsers: topRevokedUsersPopulated.map(item => ({
        user: item._id ? {
          _id: item._id._id,
          name: item._id.name,
          email: item._id.email,
          role: item._id.role
        } : null,
        revokedCount: item.count,
        reasons: item.reasons
      })),
      suspiciousActivity: suspiciousActivity.slice(0, 5) // Top 5 suspicious IPs
    });
  } catch (error) {
    console.error('❌ Error getting security dashboard:', error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get revoked tokens with pagination
// @route   GET /api/developer/security/revoked-tokens
// @access  Private (Developer/Admin only)
exports.getRevokedTokens = async (req, res) => {
  try {
    console.log('🚫 Developer accessing revoked tokens');

    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const skip = (page - 1) * limit;

    // Filters
    const reason = req.query.reason;
    const userId = req.query.userId;
    const ipAddress = req.query.ipAddress;

    const query = {};
    if (reason) query.reason = reason;
    if (userId) query.user = userId;
    if (ipAddress) query.revokedByIp = { $regex: ipAddress, $options: 'i' };

    const [tokens, totalCount] = await Promise.all([
      RevokedToken.find(query)
        .populate('user', 'name email role')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      RevokedToken.countDocuments(query)
    ]);

    res.json({
      tokens: tokens.map(token => ({
        _id: token._id,
        jti: token.jti,
        user: token.user ? {
          _id: token.user._id,
          name: token.user.name,
          email: token.user.email,
          role: token.user.role
        } : null,
        reason: token.reason,
        revokedAt: token.createdAt,
        revokedByIp: token.revokedByIp,
        issuedAt: token.issuedAt,
        expiresAt: token.expiresAt,
        timeUntilExpiry: token.expiresAt > new Date()
          ? Math.ceil((token.expiresAt - Date.now()) / 1000 / 60) + ' minutes'
          : 'Expired'
      })),
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalCount / limit),
        totalCount,
        limit,
        hasNextPage: page < Math.ceil(totalCount / limit),
        hasPrevPage: page > 1
      },
      filters: {
        appliedFilters: { reason, userId, ipAddress }
      }
    });
  } catch (error) {
    console.error('❌ Error getting revoked tokens:', error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Manually revoke user's tokens (admin action)
// @route   POST /api/developer/security/revoke-tokens
// @access  Private (Developer/Admin only)
exports.revokeUserTokens = async (req, res) => {
  try {
    const { userId, reason } = req.body;

    if (!userId) {
      return res.status(400).json({ message: 'User ID is required' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const ipAddress = req.ip || req.connection.remoteAddress;

    // Revoke all user's tokens (sets tokenValidAfter)
    await RevokedToken.revokeAllForUser(
      userId,
      reason || 'admin_revoked',
      ipAddress
    );

    // Also revoke all refresh tokens
    await RefreshToken.revokeAllForUser(
      userId,
      ipAddress,
      reason || 'Admin forced logout'
    );

    // Log this action
    await ActivityLog.create({
      level: 'warn',
      message: `Admin revoked all tokens for user: ${user.name} | ${user._id}`,
      module: 'developerController',
      user: req.user._id,
      metadata: {
        targetUser: userId,
        targetEmail: user.email,
        reason: reason || 'admin_revoked',
        adminUser: req.user.name,
        ipAddress
      },
      ip: ipAddress
    });

    console.log(`🚫 Admin ${req.user.name} revoked all tokens for user ${user.email}`);

    res.json({
      message: `All tokens revoked for user: ${user.name}`,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email
      },
      tokensRevoked: true,
      reason: reason || 'admin_revoked'
    });
  } catch (error) {
    console.error('❌ Error revoking user tokens:', error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get security settings
// @route   GET /api/developer/security/settings
// @access  Private (Developer/Admin only)
exports.getSecuritySettings = async (req, res) => {
  try {
    console.log('⚙️  Developer accessing security settings');

    const settings = await SecuritySettings.getSettings();

    res.json({
      settings,
      _note: 'These settings control security parameters across the application'
    });
  } catch (error) {
    console.error('❌ Error getting security settings:', error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update security settings
// @route   PUT /api/developer/security/settings
// @access  Private (Developer/Admin only)
exports.updateSecuritySettings = async (req, res) => {
  try {
    console.log('⚙️  Developer updating security settings');

    const updates = req.body;
    const settings = await SecuritySettings.updateSettings(updates, req.user._id);

    // Log settings change
    await ActivityLog.create({
      level: 'warn',
      message: `Security settings updated by: ${req.user.name} | ${req.user._id}`,
      module: 'developerController',
      user: req.user._id,
      metadata: {
        updates,
        adminUser: req.user.name
      },
      ip: req.ip || req.connection.remoteAddress
    });

    console.log(`⚙️  Security settings updated by ${req.user.name}`);

    res.json({
      message: 'Security settings updated successfully',
      settings,
      updatedBy: {
        _id: req.user._id,
        name: req.user.name
      }
    });
  } catch (error) {
    console.error('❌ Error updating security settings:', error);
    res.status(500).json({ message: error.message });
  }
};
