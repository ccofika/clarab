const jwt = require('jsonwebtoken');
const User = require('../models/User');
const RevokedToken = require('../models/RevokedToken');
const { COOKIE_NAMES } = require('../config/cookieConfig');
const logger = require('../utils/logger');

// Verify JWT token
// SECURITY: Supports both Bearer token and HTTP-only cookie
// SECURITY: Checks token revocation (blacklist + user-level invalidation)
exports.protect = async (req, res, next) => {
  try {
    let token;

    // Check Authorization header first (for API clients)
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }
    // Fallback to cookie (for Google OAuth and web clients)
    else if (req.cookies && req.cookies[COOKIE_NAMES.ACCESS_TOKEN]) {
      token = req.cookies[COOKIE_NAMES.ACCESS_TOKEN];
    }

    if (!token) {
      return res.status(401).json({ message: 'Not authorized, no token' });
    }

    // SECURITY: Verify token signature and expiry
    const decoded = jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: ['HS256'] // Prevent algorithm confusion attacks
    });

    // SECURITY: Check if token is in blacklist (individual revocation)
    if (decoded.jti) {
      const isRevoked = await RevokedToken.isRevoked(decoded.jti);
      if (isRevoked) {
        logger.security('revoked_token_used', {
          jti: decoded.jti,
          userId: decoded.id,
          ip: req.ip
        });
        return res.status(401).json({ message: 'Token has been revoked' });
      }
    }

    // Load user
    req.user = await User.findById(decoded.id).select('-password');

    if (!req.user) {
      return res.status(401).json({ message: 'User not found' });
    }

    // SECURITY: Check user-level token invalidation (password change, force logout)
    if (req.user.tokenValidAfter) {
      const tokenIssuedAt = new Date(decoded.iat * 1000);
      if (tokenIssuedAt < req.user.tokenValidAfter) {
        logger.security('invalidated_token_used', {
          userId: req.user._id,
          tokenIssuedAt,
          tokenValidAfter: req.user.tokenValidAfter,
          ip: req.ip
        });
        return res.status(401).json({
          message: 'Token invalidated - please log in again',
          reason: 'password_changed'
        });
      }
    }

    // Token is valid - attach to request
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Token expired' });
    }
    if (error.name === 'JsonWebTokenError') {
      logger.security('invalid_token_used', {
        error: error.message,
        ip: req.ip
      });
      return res.status(401).json({ message: 'Invalid token' });
    }
    return res.status(401).json({ message: 'Not authorized, token failed' });
  }
};

// Admin only middleware
exports.admin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(403).json({ message: 'Not authorized as admin' });
  }
};

// Developer middleware (has same permissions as admin + additional developer-specific permissions)
exports.developer = (req, res, next) => {
  if (req.user && (req.user.role === 'admin' || req.user.role === 'developer')) {
    next();
  } else {
    res.status(403).json({ message: 'Not authorized as developer' });
  }
};

// Admin or Developer middleware (for shared permissions)
exports.adminOrDeveloper = (req, res, next) => {
  if (req.user && (req.user.role === 'admin' || req.user.role === 'developer')) {
    next();
  } else {
    res.status(403).json({ message: 'Not authorized - admin or developer access required' });
  }
};

// QA middleware - for QA pages access
exports.qa = (req, res, next) => {
  const allowedRoles = ['qa', 'qa-admin', 'admin'];
  if (req.user && allowedRoles.includes(req.user.role)) {
    next();
  } else {
    res.status(403).json({ message: 'Not authorized - QA access required' });
  }
};

// QA Admin middleware - for QA admin-only pages
exports.qaAdmin = (req, res, next) => {
  const allowedRoles = ['qa-admin', 'admin'];
  if (req.user && allowedRoles.includes(req.user.role)) {
    next();
  } else {
    res.status(403).json({ message: 'Not authorized - QA Admin access required' });
  }
};

// TL (Team Leader) middleware - for TL dashboard access
exports.tl = (req, res, next) => {
  const allowedRoles = ['tl', 'admin', 'developer'];
  if (req.user && allowedRoles.includes(req.user.role)) {
    next();
  } else {
    res.status(403).json({ message: 'Not authorized - Team Leader access required' });
  }
};

// TL Admin middleware - only filipkozomara@mebit.io can manage TL assignments
exports.tlAdmin = (req, res, next) => {
  const allowedEmails = ['filipkozomara@mebit.io'];
  if (req.user && (req.user.role === 'admin' || allowedEmails.includes(req.user.email?.toLowerCase()))) {
    next();
  } else {
    res.status(403).json({ message: 'Not authorized - TL Admin access required' });
  }
};

// Aliases for readability
exports.developerOrAdmin = exports.adminOrDeveloper;
exports.adminOnly = exports.admin;

// Optional authentication - doesn't fail if no token, but sets user if valid token exists
exports.optionalAuth = async (req, res, next) => {
  try {
    let token;

    // Check Authorization header first
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }
    // Fallback to cookie
    else if (req.cookies && req.cookies[COOKIE_NAMES.ACCESS_TOKEN]) {
      token = req.cookies[COOKIE_NAMES.ACCESS_TOKEN];
    }

    // No token - continue without user (public access)
    if (!token) {
      return next();
    }

    // Try to verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: ['HS256']
    });

    // Check if token is revoked
    if (decoded.jti) {
      const isRevoked = await RevokedToken.isRevoked(decoded.jti);
      if (isRevoked) {
        return next(); // Continue without user
      }
    }

    // Load user
    const user = await User.findById(decoded.id).select('-password');

    if (user) {
      // Check user-level token invalidation
      if (user.tokenValidAfter) {
        const tokenIssuedAt = new Date(decoded.iat * 1000);
        if (tokenIssuedAt < user.tokenValidAfter) {
          return next(); // Continue without user
        }
      }
      req.user = user;
    }

    next();
  } catch (error) {
    // On any error, continue without user (public access)
    next();
  }
};
