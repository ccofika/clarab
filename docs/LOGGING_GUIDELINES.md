# Logging Guidelines & Best Practices

## Overview

This application uses Winston logger with **automatic PII sanitization** to ensure GDPR compliance and prevent sensitive data exposure.

## ⚠️ CRITICAL RULES

### 1. NEVER Use console.log in Production Code

❌ **WRONG:**
```javascript
console.log('User logged in:', { email: user.email, password: req.body.password });
```

✅ **CORRECT:**
```javascript
logger.auth('login_success', { email: user.email }); // Email will be auto-masked
```

### 2. NEVER Log Sensitive Fields

The following fields are **AUTOMATICALLY REDACTED** by our logger:
- `password`
- `token` / `accessToken` / `refreshToken`
- `secret` / `apiKey` / `api_key`
- `creditCard` / `cardNumber` / `cvv`
- `ssn` / `socialSecurityNumber`

### 3. PII Fields are Automatically Masked

The following PII fields are **AUTOMATICALLY MASKED**:
- `email` → `j***@mebit.io`
- `phone` / `phoneNumber` → `***1234`
- `ip` / `ipAddress` → `192.168.***.***`
- `name` / `firstName` / `lastName` → `J***`

---

## Usage

### Import the Logger

```javascript
const logger = require('../utils/logger');
```

### Standard Logging Levels

```javascript
// Debug (development only)
logger.debug('Processing request', { userId: user._id });

// Info (general information)
logger.info('User profile updated', { userId: user._id });

// Warning (non-critical issues)
logger.warn('Rate limit approaching', { userId: user._id, requests: 95 });

// Error (errors that need attention)
logger.error('Database connection failed', { error: err.message });
```

### Specialized Logging Methods

#### 1. Authentication Events

```javascript
// Login attempt (email auto-masked)
logger.auth('login_attempt', { email: 'user@mebit.io' });
// Output: email: "u***@mebit.io"

// Login success
logger.auth('login_success', { userId: user._id, email: user.email });

// Login failure
logger.auth('login_failed_user_not_found', { email: 'nonexistent@mebit.io' });

// Account locked
logger.auth('account_locked', { userId: user._id, attempts: 5 });
```

#### 2. API Request Logging

```javascript
// Log API requests (PII auto-sanitized)
logger.request(req, { action: 'create_workspace' });
```

#### 3. Validation Logging

```javascript
// Validation passed (NO request body logged)
logger.validation('login', true);

// Validation failed (only errors, NO request body)
logger.validation('register', false, [
  'Email is required',
  'Password too weak'
]);
```

---

## Examples

### ✅ CORRECT: Safe Logging

```javascript
// Authentication
exports.login = async (req, res) => {
  try {
    logger.auth('login_attempt', { email: req.body.email });
    // Email auto-masked: j***@mebit.io

    const user = await User.findOne({ email });
    if (!user) {
      logger.auth('login_failed_user_not_found', { email: req.body.email });
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      logger.auth('password_mismatch', { userId: user._id });
      // Only userId logged, NO password
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    logger.auth('login_success', { userId: user._id });
    // Success!
  } catch (error) {
    logger.error('Login error', { error: error.message, stack: error.stack });
  }
};
```

### ❌ WRONG: Dangerous Logging

```javascript
// NEVER DO THIS - Logs plaintext password!
console.log('Login attempt:', req.body);

// NEVER DO THIS - Logs email without masking
console.log('User not found:', email);

// NEVER DO THIS - Logs entire request body (may contain passwords!)
console.log('Validating:', JSON.stringify(req.body, null, 2));

// NEVER DO THIS - Logs tokens
console.log('Token generated:', token);
```

---

## Environment-Based Logging

### Development
- Log level: `debug`
- Format: Colorful, pretty-printed
- Output: Console only
- All logs visible

### Production
- Log level: `info`
- Format: JSON (structured)
- Output: Console + Files
- Debug logs disabled
- Logs saved to:
  - `logs/error.log` (errors only)
  - `logs/combined.log` (all logs)

### Configure Log Level

Set in `.env`:
```bash
LOG_LEVEL=info  # debug, info, warn, error
NODE_ENV=production
```

---

## Log Output Examples

### Sanitized Authentication Log

**Before sanitization** (NEVER logged):
```json
{
  "email": "john.doe@mebit.io",
  "password": "MyPassword123!",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**After sanitization** (actually logged):
```json
{
  "timestamp": "2025-10-20T19:46:33.000Z",
  "level": "info",
  "message": "AUTH: login_attempt",
  "email": "j***@mebit.io"
}
```

### Sanitized Validation Log

**NEVER logs request body** - only schema name and pass/fail:
```json
{
  "timestamp": "2025-10-20T19:46:33.000Z",
  "level": "warn",
  "message": "VALIDATION: register failed",
  "errorCount": 2,
  "errors": [
    "Email is required",
    "Password too weak"
  ]
}
```

---

## GDPR Compliance

### Why This Matters

**GDPR Article 5(1)(f):** Personal data must be processed securely, including protection against unauthorized access.

**Logging PII = GDPR Violation** if:
- Personal data (email, name, IP) logged without consent
- Logs are not secured/encrypted
- Logs retained longer than necessary
- Users can't request log deletion

### Our Solution

✅ **Automatic PII Masking:** Emails, names, IPs masked by default
✅ **Credential Redaction:** Passwords, tokens NEVER logged
✅ **Production Log Files:** Secured, size-limited, auto-rotated
✅ **Minimal Logging:** Only log what's necessary
✅ **User Anonymization:** Use userIds instead of emails when possible

---

## Migration Guide

### Replacing console.log

**Old code:**
```javascript
console.log('🔐 Login attempt:', { email: req.body.email });
console.log('❌ User not found:', email);
console.log('✅ Login successful for:', email);
console.error('❌ Login error:', error);
```

**New code:**
```javascript
logger.auth('login_attempt', { email: req.body.email });
logger.auth('login_failed_user_not_found', { email });
logger.auth('login_success', { userId: user._id });
logger.error('Login error', { error: error.message, stack: error.stack });
```

### Replacing Validation Logs

**Old code (DANGEROUS - logs passwords!):**
```javascript
console.log(`🔍 Validating ${schemaName}:`, JSON.stringify(req.body, null, 2));
console.error(`❌ Validation failed for ${schemaName}:`, errors);
console.log(`✅ Validation passed for ${schemaName}`);
```

**New code (SAFE - no request body logged):**
```javascript
logger.validation(schemaName, false, errors); // Failed
logger.validation(schemaName, true);          // Passed
```

---

## Testing PII Sanitization

Run the test suite to verify sanitization:

```bash
node tests/logger.test.js
```

**Expected output:**
- ✅ Passwords → `[REDACTED]`
- ✅ Tokens → `[REDACTED]`
- ✅ Emails → `j***@mebit.io`
- ✅ IPs → `192.168.***.***`
- ✅ Phones → `***1234`
- ✅ Names → `J***`

---

## Common Mistakes

### ❌ Mistake #1: Logging Full Objects

```javascript
// WRONG - May contain sensitive fields
logger.info('User data:', user);

// CORRECT - Only log safe fields
logger.info('User updated', { userId: user._id, role: user.role });
```

### ❌ Mistake #2: Logging Error Objects Directly

```javascript
// WRONG - May contain sensitive data in error message
logger.error('Error occurred:', error);

// CORRECT - Log message and stack separately
logger.error('Error occurred', { error: error.message, stack: error.stack });
```

### ❌ Mistake #3: Using console.log for Debugging

```javascript
// WRONG - Bypasses sanitization, stays in production
console.log('Debug:', sensitiveData);

// CORRECT - Use logger.debug (auto-sanitized, disabled in production)
logger.debug('Debug info', { userId: user._id });
```

---

## FAQ

### Q: Can I use console.log during development?
**A:** Avoid it. Use `logger.debug()` instead. It's disabled in production and still sanitizes PII.

### Q: What if I need to log raw data for debugging?
**A:** Use a dedicated debug session with `NODE_ENV=development` and review logs immediately. NEVER push raw logs to production.

### Q: How do I know if a field will be redacted?
**A:** Check `utils/logger.js` for `SENSITIVE_FIELDS` and `PII_FIELDS` arrays.

### Q: Can I add more sensitive fields?
**A:** Yes! Edit `utils/logger.js` and add to `SENSITIVE_FIELDS` or `PII_FIELDS` arrays.

### Q: What about third-party logs?
**A:** Third-party libraries may log unsafely. Review their logging and consider wrapping them.

---

## Summary

| Rule | Description |
|------|-------------|
| ✅ **USE** logger | Never use console.log |
| ✅ **AUTO-SANITIZE** | Logger automatically masks PII |
| ✅ **userIds not emails** | Log userIds instead of emails when possible |
| ✅ **Minimal logging** | Only log what's necessary |
| ✅ **Test regularly** | Run `tests/logger.test.js` |
| ❌ **NEVER** log passwords | They're auto-redacted anyway |
| ❌ **NEVER** log tokens | They're auto-redacted anyway |
| ❌ **NEVER** log full req.body | May contain passwords |

---

**Last Updated:** 2025-10-20
**Status:** ✅ Implemented & Tested
