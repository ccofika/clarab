const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Verify JWT token
// SECURITY: Supports both Bearer token and HTTP-only cookie
exports.protect = async (req, res, next) => {
  try {
    let token;

    // Check Authorization header first (for API clients)
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }
    // Fallback to cookie (for Google OAuth and web clients)
    else if (req.cookies && req.cookies.jwt) {
      token = req.cookies.jwt;
    }

    if (!token) {
      return res.status(401).json({ message: 'Not authorized, no token' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.id).select('-password');

    if (!req.user) {
      return res.status(401).json({ message: 'User not found' });
    }

    next();
  } catch (error) {
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
