const winston = require('winston');
const path = require('path');

// Sensitive field patterns to redact
const SENSITIVE_FIELDS = [
  'password',
  'token',
  'accessToken',
  'refreshToken',
  'secret',
  'apiKey',
  'api_key',
  'creditCard',
  'cardNumber',
  'cvv',
  'ssn',
  'socialSecurityNumber'
];

// PII fields to mask (partial redaction)
const PII_FIELDS = [
  'email',
  'phone',
  'phoneNumber',
  'address',
  'ip',
  'ipAddress',
  'name',
  'firstName',
  'lastName'
];

/**
 * Sanitize sensitive data from objects
 * @param {any} data - Data to sanitize
 * @returns {any} - Sanitized data
 */
function sanitize(data) {
  if (data === null || data === undefined) {
    return data;
  }

  // Handle MongoDB ObjectId - convert to string
  if (data && data.constructor && data.constructor.name === 'ObjectId') {
    return data.toString();
  }

  // Handle objects with _bsontype (alternative ObjectId check)
  if (data && data._bsontype === 'ObjectID') {
    return data.toString();
  }

  // Handle strings
  if (typeof data === 'string') {
    return data;
  }

  // Handle arrays
  if (Array.isArray(data)) {
    return data.map(item => sanitize(item));
  }

  // Handle objects
  if (typeof data === 'object') {
    const sanitized = {};

    for (const [key, value] of Object.entries(data)) {
      const lowerKey = key.toLowerCase();

      // Completely redact sensitive fields
      if (SENSITIVE_FIELDS.some(field => lowerKey.includes(field.toLowerCase()))) {
        sanitized[key] = '[REDACTED]';
        continue;
      }

      // Partially mask PII fields
      if (PII_FIELDS.some(field => lowerKey.includes(field.toLowerCase()))) {
        if (typeof value === 'string') {
          // Mask email: u***@example.com
          if (lowerKey.includes('email') && value.includes('@')) {
            const [local, domain] = value.split('@');
            sanitized[key] = `${local[0]}***@${domain}`;
          }
          // Mask phone: ***1234
          else if (lowerKey.includes('phone')) {
            sanitized[key] = `***${value.slice(-4)}`;
          }
          // Mask IP: 192.168.***.***
          else if (lowerKey.includes('ip')) {
            const parts = value.split('.');
            if (parts.length === 4) {
              sanitized[key] = `${parts[0]}.${parts[1]}.***.***`;
            } else {
              sanitized[key] = '***';
            }
          }
          // Mask names: J***
          else if (lowerKey.includes('name')) {
            sanitized[key] = value.length > 0 ? `${value[0]}***` : '***';
          }
          // Default: partial mask
          else {
            sanitized[key] = value.length > 3 ? `${value.slice(0, 2)}***` : '***';
          }
        } else {
          sanitized[key] = '[PII]';
        }
        continue;
      }

      // Recursively sanitize nested objects
      sanitized[key] = sanitize(value);
    }

    return sanitized;
  }

  return data;
}

/**
 * Format for development (colorful, detailed)
 */
const devFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let metaStr = '';
    if (Object.keys(meta).length > 0) {
      // Sanitize metadata before logging
      const sanitizedMeta = sanitize(meta);
      metaStr = '\n' + JSON.stringify(sanitizedMeta, null, 2);
    }
    return `${timestamp} [${level}]: ${message}${metaStr}`;
  })
);

/**
 * Format for production (JSON, structured)
 */
const prodFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    // Sanitize all metadata
    const sanitizedMeta = sanitize(meta);
    return JSON.stringify({
      timestamp,
      level,
      message,
      ...sanitizedMeta
    });
  })
);

/**
 * Create Winston logger instance
 */
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  format: process.env.NODE_ENV === 'production' ? prodFormat : devFormat,
  transports: [
    // Console output
    new winston.transports.Console({
      stderrLevels: ['error']
    })
  ],
  // Don't exit on uncaught errors
  exitOnError: false
});

// In production, also log to file
if (process.env.NODE_ENV === 'production') {
  // Ensure logs directory exists
  const logsDir = path.join(__dirname, '../logs');

  logger.add(new winston.transports.File({
    filename: path.join(logsDir, 'error.log'),
    level: 'error',
    maxsize: 10485760, // 10MB
    maxFiles: 5
  }));

  logger.add(new winston.transports.File({
    filename: path.join(logsDir, 'combined.log'),
    maxsize: 10485760, // 10MB
    maxFiles: 10
  }));
}

/**
 * Safely log authentication events without PII
 * @param {string} event - Event name (e.g., 'login_attempt', 'login_success')
 * @param {object} data - Event data (will be sanitized)
 */
logger.auth = function(event, data = {}) {
  const sanitizedData = sanitize(data);
  logger.info(`AUTH: ${event}`, sanitizedData);
};

/**
 * Safely log API requests without PII
 * @param {object} req - Express request object
 * @param {object} additionalData - Additional data to log
 */
logger.request = function(req, additionalData = {}) {
  const sanitizedData = sanitize({
    method: req.method,
    path: req.path,
    userId: req.user?.id || 'anonymous',
    ...additionalData
  });
  logger.debug(`API: ${req.method} ${req.path}`, sanitizedData);
};

/**
 * Safely log validation events
 * @param {string} schema - Schema name
 * @param {boolean} passed - Whether validation passed
 * @param {array} errors - Validation errors (if any)
 */
logger.validation = function(schema, passed, errors = []) {
  if (passed) {
    logger.debug(`VALIDATION: ${schema} passed`);
  } else {
    // Log errors but not the actual invalid data
    logger.warn(`VALIDATION: ${schema} failed`, {
      errorCount: errors.length,
      errors: errors
    });
  }
};

/**
 * Safely log security events (token revocation, suspicious activity, etc.)
 * @param {string} event - Event name (e.g., 'revoked_token_used', 'invalid_token_used')
 * @param {object} data - Event data (will be sanitized)
 */
logger.security = function(event, data = {}) {
  const sanitizedData = sanitize(data);
  logger.warn(`SECURITY: ${event}`, sanitizedData);
};

module.exports = logger;
