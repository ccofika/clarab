const logger = require('../utils/logger');

/**
 * Manual test file for logger PII sanitization
 * Run with: node tests/logger.test.js
 */

console.log('=== LOGGER PII SANITIZATION TESTS ===\n');

// Mock MongoDB ObjectId for testing
class MockObjectId {
  constructor(id) {
    this._id = id || '507f1f77bcf86cd799439011';
  }
  toString() {
    return this._id;
  }
}
MockObjectId.prototype.constructor.name = 'ObjectId';

// Test 1: Password Redaction
console.log('Test 1: Password Redaction');
console.log('Expected: password should be [REDACTED]\n');
logger.info('Testing password sanitization', {
  username: 'testuser',
  password: 'MySecretPassword123!',
  email: 'test@mebit.io'
});
console.log('\n---\n');

// Test 2: Token Redaction
console.log('Test 2: Token Redaction');
console.log('Expected: accessToken and refreshToken should be [REDACTED]\n');
logger.info('Testing token sanitization', {
  userId: '507f1f77bcf86cd799439011',
  accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  refreshToken: 'abc123def456ghi789jkl012',
  role: 'user'
});
console.log('\n---\n');

// Test 3: Email Masking
console.log('Test 3: Email Masking');
console.log('Expected: email should be masked as j***@mebit.io\n');
logger.auth('login_attempt', {
  email: 'john.doe@mebit.io',
  timestamp: new Date().toISOString()
});
console.log('\n---\n');

// Test 4: Nested Object Sanitization
console.log('Test 4: Nested Object Sanitization');
console.log('Expected: password in nested object should be [REDACTED]\n');
logger.info('Testing nested sanitization', {
  user: {
    name: 'John Doe',
    email: 'john@mebit.io',
    credentials: {
      password: 'SuperSecret123!',
      apiKey: 'sk_live_abc123'
    }
  }
});
console.log('\n---\n');

// Test 5: Array Sanitization
console.log('Test 5: Array Sanitization');
console.log('Expected: passwords in array should be [REDACTED]\n');
logger.info('Testing array sanitization', {
  users: [
    { email: 'user1@mebit.io', password: 'pass1' },
    { email: 'user2@mebit.io', password: 'pass2' }
  ]
});
console.log('\n---\n');

// Test 6: IP Address Masking
console.log('Test 6: IP Address Masking');
console.log('Expected: IP should be masked as 192.168.***.***\n');
logger.info('Testing IP masking', {
  ipAddress: '192.168.1.100',
  userAgent: 'Mozilla/5.0'
});
console.log('\n---\n');

// Test 7: Phone Number Masking
console.log('Test 7: Phone Number Masking');
console.log('Expected: phone should be masked as ***1234\n');
logger.info('Testing phone masking', {
  phoneNumber: '+1234567890',
  name: 'John'
});
console.log('\n---\n');

// Test 8: Validation Logging (No PII)
console.log('Test 8: Validation Logging');
console.log('Expected: Only schema name and pass/fail, NO request body\n');
logger.validation('login', true);
logger.validation('register', false, ['Email is required', 'Password too weak']);
console.log('\n---\n');

// Test 9: Authentication Events (Email Masked)
console.log('Test 9: Authentication Events');
console.log('Expected: Email should be masked\n');
logger.auth('login_success', {
  email: 'admin@mebit.io',
  userId: '507f1f77bcf86cd799439011',
  role: 'admin'
});
console.log('\n---\n');

// Test 10: Mixed Sensitive Data
console.log('Test 10: Mixed Sensitive Data');
console.log('Expected: All sensitive fields redacted or masked\n');
logger.info('Testing comprehensive sanitization', {
  email: 'test@mebit.io',
  password: 'MyPassword123!',
  token: 'bearer-token-xyz',
  secret: 'app-secret-key',
  apiKey: 'sk_live_abc123',
  creditCard: '4111111111111111',
  ssn: '123-45-6789',
  name: 'John Doe',
  ip: '10.0.0.1',
  phone: '555-1234',
  userId: '507f1f77bcf86cd799439011'
});
console.log('\n---\n');

// Test 11: MongoDB ObjectId Conversion
console.log('Test 11: MongoDB ObjectId Conversion');
console.log('Expected: ObjectId should be converted to string\n');
const mockUserId = new MockObjectId('68f61b5de45333b7d94cccd7');
logger.auth('test_objectid', {
  userId: mockUserId,
  role: 'developer'
});
console.log('\n---\n');

console.log('=== TESTS COMPLETE ===');
console.log('\nReview the output above to ensure:');
console.log('1. Passwords, tokens, secrets are [REDACTED]');
console.log('2. Emails are masked (e.g., j***@mebit.io)');
console.log('3. IP addresses are masked (e.g., 192.168.***.***) ');
console.log('4. Phone numbers are masked (e.g., ***1234)');
console.log('5. Names are masked (e.g., J***)');
console.log('6. Nested objects and arrays are sanitized');
console.log('7. No full request bodies are logged');
console.log('8. MongoDB ObjectIds are converted to strings');
