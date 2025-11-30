const Joi = require('joi');
const logger = require('../utils/logger');

// Password validation schema with strong requirements
const passwordSchema = Joi.string()
  .min(8)
  .max(128)
  .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
  .required()
  .messages({
    'string.min': 'Password must be at least 8 characters long',
    'string.max': 'Password must not exceed 128 characters',
    'string.pattern.base': 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character (@$!%*?&)',
    'any.required': 'Password is required'
  });

// Email validation schema with @mebit.io domain restriction
const emailSchema = Joi.string()
  .email()
  .pattern(/@mebit\.io$/)
  .required()
  .messages({
    'string.email': 'Please provide a valid email address',
    'string.pattern.base': 'Only @mebit.io email addresses are allowed',
    'any.required': 'Email is required'
  });

// Name validation schema
const nameSchema = Joi.string()
  .min(2)
  .max(100)
  .trim()
  .required()
  .messages({
    'string.min': 'Name must be at least 2 characters long',
    'string.max': 'Name must not exceed 100 characters',
    'any.required': 'Name is required'
  });

// Validation Schemas
const schemas = {
  // Register validation
  register: Joi.object({
    name: nameSchema,
    email: emailSchema,
    password: passwordSchema
  }),

  // Login validation
  login: Joi.object({
    email: emailSchema,
    password: Joi.string().required().messages({
      'any.required': 'Password is required'
    })
  }),

  // Setup password validation
  setupPassword: Joi.object({
    password: passwordSchema,
    confirmPassword: Joi.string()
      .valid(Joi.ref('password'))
      .required()
      .messages({
        'any.only': 'Passwords must match',
        'any.required': 'Confirm password is required'
      })
  }),

  // Change password validation
  changePassword: Joi.object({
    oldPassword: Joi.string().required().messages({
      'any.required': 'Old password is required'
    }),
    newPassword: passwordSchema
  }),

  // Update profile validation
  updateProfile: Joi.object({
    name: nameSchema
  }),

  // Create privileged user validation (admin only)
  createPrivilegedUser: Joi.object({
    name: nameSchema,
    email: emailSchema,
    password: passwordSchema,
    role: Joi.string()
      .valid('admin', 'developer')
      .required()
      .messages({
        'any.only': 'Role must be either admin or developer',
        'any.required': 'Role is required'
      })
  }),

  // Update user role validation (admin only)
  updateUserRole: Joi.object({
    userId: Joi.string()
      .pattern(/^[0-9a-fA-F]{24}$/)
      .required()
      .messages({
        'string.pattern.base': 'Invalid user ID format',
        'any.required': 'User ID is required'
      }),
    role: Joi.string()
      .valid('user', 'admin', 'developer')
      .required()
      .messages({
        'any.only': 'Role must be user, admin, or developer',
        'any.required': 'Role is required'
      })
  }),

  // Workspace validation
  createWorkspace: Joi.object({
    name: Joi.string()
      .min(1)
      .max(200)
      .trim()
      .required()
      .messages({
        'string.min': 'Workspace name is required',
        'string.max': 'Workspace name must not exceed 200 characters',
        'any.required': 'Workspace name is required'
      }),
    type: Joi.string()
      .valid('personal', 'announcements')
      .optional()
      .messages({
        'any.only': 'Workspace type must be either personal or announcements'
      }),
    invitedMembers: Joi.array()
      .items(Joi.string().pattern(/^[0-9a-fA-F]{24}$/))
      .optional()
      .messages({
        'string.pattern.base': 'Invalid user ID format in invited members'
      })
  }),

  updateWorkspace: Joi.object({
    name: Joi.string()
      .min(1)
      .max(200)
      .trim()
      .optional(),
    invitedMembers: Joi.array()
      .items(Joi.string().pattern(/^[0-9a-fA-F]{24}$/))
      .optional(),
    settings: Joi.object({
      backgroundColor: Joi.string().optional(),
      gridEnabled: Joi.boolean().optional(),
      snapToGrid: Joi.boolean().optional()
    }).optional()
  }),

  // QA Manager - Agent validation
  createAgent: Joi.object({
    name: Joi.string()
      .min(1)
      .max(200)
      .trim()
      .required()
      .messages({
        'string.min': 'Agent name is required',
        'string.max': 'Agent name must not exceed 200 characters',
        'any.required': 'Agent name is required'
      }),
    position: Joi.string()
      .max(100)
      .trim()
      .optional()
      .allow('')
      .messages({
        'string.max': 'Position must not exceed 100 characters'
      }),
    team: Joi.string()
      .max(100)
      .trim()
      .optional()
      .allow('')
      .messages({
        'string.max': 'Team must not exceed 100 characters'
      })
  }),

  updateAgent: Joi.object({
    name: Joi.string()
      .min(1)
      .max(200)
      .trim()
      .optional(),
    position: Joi.string()
      .max(100)
      .trim()
      .optional()
      .allow(''),
    team: Joi.string()
      .max(100)
      .trim()
      .optional()
      .allow('')
  }),

  // QA Manager - Ticket validation
  createTicket: Joi.object({
    agent: Joi.string()
      .pattern(/^[0-9a-fA-F]{24}$/)
      .required()
      .messages({
        'string.pattern.base': 'Invalid agent ID format',
        'any.required': 'Agent is required'
      }),
    ticketId: Joi.string()
      .trim()
      .max(100)
      .required()
      .messages({
        'string.max': 'Ticket ID must not exceed 100 characters',
        'any.required': 'Ticket ID is required'
      }),
    shortDescription: Joi.string()
      .trim()
      .max(500)
      .optional()
      .allow('')
      .messages({
        'string.max': 'Short description must not exceed 500 characters'
      }),
    status: Joi.string()
      .valid('Selected', 'Graded')
      .optional()
      .messages({
        'any.only': 'Status must be Selected or Graded'
      }),
    dateEntered: Joi.date()
      .iso()
      .optional()
      .messages({
        'date.format': 'Date entered must be a valid ISO date'
      }),
    notes: Joi.string()
      .trim()
      .optional()
      .allow(''),
    feedback: Joi.string()
      .trim()
      .optional()
      .allow(''),
    qualityScorePercent: Joi.number()
      .min(0)
      .max(100)
      .optional()
      .allow(null, '')
      .messages({
        'number.min': 'Quality score must be at least 0',
        'number.max': 'Quality score must not exceed 100'
      })
  }),

  updateTicket: Joi.object({
    agent: Joi.string()
      .pattern(/^[0-9a-fA-F]{24}$/)
      .optional()
      .messages({
        'string.pattern.base': 'Invalid agent ID format'
      }),
    ticketId: Joi.string()
      .trim()
      .max(100)
      .optional(),
    shortDescription: Joi.string()
      .trim()
      .max(500)
      .optional()
      .allow(''),
    status: Joi.string()
      .valid('Selected', 'Graded')
      .optional()
      .messages({
        'any.only': 'Status must be Selected or Graded'
      }),
    dateEntered: Joi.date()
      .iso()
      .optional(),
    notes: Joi.string()
      .trim()
      .optional()
      .allow(''),
    feedback: Joi.string()
      .trim()
      .optional()
      .allow(''),
    qualityScorePercent: Joi.number()
      .min(0)
      .max(100)
      .optional()
      .allow(null, ''),
    gradedDate: Joi.date()
      .iso()
      .optional()
      .allow(null),
    isArchived: Joi.boolean()
      .optional(),
    archivedDate: Joi.date()
      .iso()
      .optional()
      .allow(null)
  })
};

// Validation middleware factory
const validate = (schemaName) => {
  return (req, res, next) => {
    const schema = schemas[schemaName];

    if (!schema) {
      logger.error(`Validation schema not found: ${schemaName}`);
      return res.status(500).json({ message: 'Validation schema not found' });
    }

    // Validate request body
    const { error, value } = schema.validate(req.body, {
      abortEarly: false, // Return all errors, not just the first one
      stripUnknown: true // Remove unknown fields
    });

    if (error) {
      const errors = error.details.map(detail => detail.message);
      logger.validation(schemaName, false, errors);
      return res.status(400).json({
        message: 'Validation failed',
        errors: errors
      });
    }

    logger.validation(schemaName, true);
    // Replace req.body with validated and sanitized data
    req.body = value;
    next();
  };
};

module.exports = { validate, schemas };
