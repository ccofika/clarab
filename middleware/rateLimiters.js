const rateLimit = require('express-rate-limit');

// Rate limiter for login endpoint
// Prevents brute force attacks while allowing normal usage
// NOTE: Account lockout system (5 failed attempts) is the primary brute force protection
// This rate limiter is a secondary layer to prevent distributed attacks
exports.loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // Limit each IP to 50 login attempts per 15 minutes (generous for development/normal use)
  message: 'Too many login attempts from this IP, please try again after 15 minutes.',
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Don't count successful logins against the limit
  skipFailedRequests: false, // Count failed attempts (brute force protection)
});

// Rate limiter for registration endpoint
exports.registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // Limit each IP to 10 registration attempts per hour
  message: 'Too many registration attempts from this IP, please try again after an hour.',
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Don't count successful registrations
});

// Rate limiter for token refresh endpoint
// Prevents token refresh abuse and DoS attacks
exports.refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 refresh attempts per 15 minutes
  message: 'Too many token refresh attempts from this IP, please try again after 15 minutes.',
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false, // Count all refresh attempts
});

// Rate limiter for change password endpoint
// Prevents password brute force and DoS attacks
exports.changePasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // Limit each IP to 5 password change attempts per hour
  message: 'Too many password change attempts from this IP, please try again after an hour.',
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Don't count successful password changes
});
