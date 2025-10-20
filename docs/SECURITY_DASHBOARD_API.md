# Security Dashboard API Documentation

## Overview

The Security Dashboard provides comprehensive monitoring and management of JWT token revocation, security events, and configurable security settings. All endpoints require authentication and developer/admin role.

**Base URL:** `/api/developer/security`

---

## Endpoints

### 1. Get Security Dashboard Overview

**Endpoint:** `GET /api/developer/security/dashboard`

**Description:** Retrieves comprehensive security statistics including token revocations, security events, and suspicious activity.

**Authentication:** Required (Developer/Admin only)

**Response:**
```json
{
  "timestamp": "2025-10-20T12:00:00.000Z",
  "tokenStats": {
    "revoked": {
      "total": 150,
      "last24h": 12,
      "byLogout": 120,
      "byPasswordChange": 30
    },
    "active": {
      "refreshTokens": 45
    },
    "usersWithInvalidatedTokens": 8
  },
  "securityEvents": {
    "last7Days": {
      "failedLogins": 23,
      "successfulLogins": 456,
      "accountLockouts": 2,
      "suspiciousIPs": 3
    },
    "loginSuccessRate": "95.20%"
  },
  "recentRevocations": [
    {
      "jti": "abc123...",
      "user": {
        "_id": "507f1f77bcf86cd799439011",
        "name": "John Doe",
        "email": "john@example.com"
      },
      "reason": "logout",
      "revokedAt": "2025-10-20T11:30:00.000Z",
      "revokedByIp": "192.168.1.1"
    }
  ],
  "topRevokedUsers": [
    {
      "user": {
        "_id": "507f1f77bcf86cd799439011",
        "name": "John Doe",
        "email": "john@example.com",
        "role": "user"
      },
      "revokedCount": 15,
      "reasons": ["logout", "password_changed", "logout_all_devices"]
    }
  ],
  "suspiciousActivity": [
    {
      "_id": "192.168.1.100",
      "failedAttempts": 25,
      "emails": ["test@example.com", "admin@example.com"],
      "firstAttempt": "2025-10-20T10:00:00.000Z",
      "lastAttempt": "2025-10-20T11:00:00.000Z"
    }
  ]
}
```

---

### 2. Get Revoked Tokens (Paginated)

**Endpoint:** `GET /api/developer/security/revoked-tokens`

**Description:** Retrieves a paginated list of revoked tokens with optional filters.

**Authentication:** Required (Developer/Admin only)

**Query Parameters:**
- `page` (number, default: 1) - Page number
- `limit` (number, default: 50, max: 200) - Results per page
- `reason` (string) - Filter by revocation reason
- `userId` (string) - Filter by user ID
- `ipAddress` (string) - Filter by IP address (partial match)

**Example Request:**
```
GET /api/developer/security/revoked-tokens?page=1&limit=50&reason=logout
```

**Response:**
```json
{
  "tokens": [
    {
      "_id": "507f191e810c19729de860ea",
      "jti": "abc123def456...",
      "user": {
        "_id": "507f1f77bcf86cd799439011",
        "name": "John Doe",
        "email": "john@example.com",
        "role": "user"
      },
      "reason": "logout",
      "revokedAt": "2025-10-20T11:30:00.000Z",
      "revokedByIp": "192.168.1.1",
      "issuedAt": "2025-10-20T11:15:00.000Z",
      "expiresAt": "2025-10-20T11:30:00.000Z",
      "timeUntilExpiry": "Expired"
    }
  ],
  "pagination": {
    "currentPage": 1,
    "totalPages": 3,
    "totalCount": 150,
    "limit": 50,
    "hasNextPage": true,
    "hasPrevPage": false
  },
  "filters": {
    "appliedFilters": {
      "reason": "logout",
      "userId": null,
      "ipAddress": null
    }
  }
}
```

---

### 3. Manually Revoke User Tokens (Admin Action)

**Endpoint:** `POST /api/developer/security/revoke-tokens`

**Description:** Revokes all tokens for a specific user. This forces the user to log in again. Action is logged in ActivityLog.

**Authentication:** Required (Developer/Admin only)

**Request Body:**
```json
{
  "userId": "507f1f77bcf86cd799439011",
  "reason": "security_incident"
}
```

**Response:**
```json
{
  "message": "All tokens revoked for user: John Doe",
  "user": {
    "_id": "507f1f77bcf86cd799439011",
    "name": "John Doe",
    "email": "john@example.com"
  },
  "tokensRevoked": true,
  "reason": "security_incident"
}
```

**Revocation Reasons:**
- `logout` - User logged out
- `password_changed` - User changed password
- `security_incident` - Security incident detected
- `admin_revoked` - Admin manually revoked
- `account_deleted` - User account deleted

---

### 4. Get Security Settings

**Endpoint:** `GET /api/developer/security/settings`

**Description:** Retrieves current security configuration settings.

**Authentication:** Required (Developer/Admin only)

**Response:**
```json
{
  "settings": {
    "jwt": {
      "accessTokenExpiry": "15m",
      "refreshTokenExpiry": 7,
      "algorithm": "HS256"
    },
    "accountLockout": {
      "maxLoginAttempts": 5,
      "lockDuration": 30
    },
    "passwordPolicy": {
      "minLength": 8,
      "requireUppercase": true,
      "requireLowercase": true,
      "requireNumbers": true,
      "requireSpecialChars": true,
      "bcryptRounds": 10
    },
    "cookies": {
      "sameSite": "strict",
      "httpOnly": true,
      "secure": "production",
      "useHostPrefix": false
    },
    "rateLimiting": {
      "loginMaxAttempts": 50,
      "loginWindowMinutes": 15,
      "registerMaxAttempts": 10,
      "registerWindowMinutes": 60
    },
    "tokenRevocation": {
      "enableBlacklist": true,
      "enableUserLevelRevocation": true,
      "revokeOnPasswordChange": true
    },
    "lastUpdatedBy": "507f1f77bcf86cd799439011",
    "createdAt": "2025-10-20T10:00:00.000Z",
    "updatedAt": "2025-10-20T11:00:00.000Z"
  },
  "_note": "These settings control security parameters across the application"
}
```

---

### 5. Update Security Settings

**Endpoint:** `PUT /api/developer/security/settings`

**Description:** Updates security configuration settings. Only provided fields are updated. Action is logged in ActivityLog.

**Authentication:** Required (Developer/Admin only)

**Request Body:**
```json
{
  "jwt": {
    "accessTokenExpiry": "30m",
    "refreshTokenExpiry": 14
  },
  "accountLockout": {
    "maxLoginAttempts": 10,
    "lockDuration": 60
  }
}
```

**Response:**
```json
{
  "message": "Security settings updated successfully",
  "settings": {
    "jwt": {
      "accessTokenExpiry": "30m",
      "refreshTokenExpiry": 14,
      "algorithm": "HS256"
    },
    "accountLockout": {
      "maxLoginAttempts": 10,
      "lockDuration": 60
    },
    // ... other settings remain unchanged
  },
  "updatedBy": {
    "_id": "507f1f77bcf86cd799439011",
    "name": "Admin User"
  }
}
```

**Available Settings:**

#### JWT Settings
- `accessTokenExpiry`: `'5m'` | `'15m'` | `'30m'` | `'1h'` (default: `'15m'`)
- `refreshTokenExpiry`: 1-30 days (default: 7)
- `algorithm`: `'HS256'` | `'HS384'` | `'HS512'` (default: `'HS256'`)

#### Account Lockout Settings
- `maxLoginAttempts`: 3-10 attempts (default: 5)
- `lockDuration`: 5-120 minutes (default: 30)

#### Password Policy
- `minLength`: 6-20 characters (default: 8)
- `requireUppercase`: boolean (default: true)
- `requireLowercase`: boolean (default: true)
- `requireNumbers`: boolean (default: true)
- `requireSpecialChars`: boolean (default: true)
- `bcryptRounds`: 10-14 rounds (default: 10)

#### Cookie Settings
- `sameSite`: `'strict'` | `'lax'` | `'none'` (default: `'strict'`)
- `httpOnly`: boolean (default: true)
- `secure`: `'always'` | `'production'` | `'never'` (default: `'production'`)
- `useHostPrefix`: boolean (default: false)

#### Rate Limiting
- `loginMaxAttempts`: 10-100 attempts (default: 50)
- `loginWindowMinutes`: 5-60 minutes (default: 15)
- `registerMaxAttempts`: 5-50 attempts (default: 10)
- `registerWindowMinutes`: 15-120 minutes (default: 60)

#### Token Revocation
- `enableBlacklist`: boolean (default: true)
- `enableUserLevelRevocation`: boolean (default: true)
- `revokeOnPasswordChange`: boolean (default: true)

---

## Security Features

### Two-Tier Token Revocation

1. **Individual Token Revocation (Blacklist)**
   - Used for logout
   - Revokes specific access token via JTI
   - Stored in RevokedToken collection
   - Auto-deleted after expiry (TTL index)

2. **User-Level Revocation (tokenValidAfter)**
   - Used for password changes, security incidents
   - Sets `tokenValidAfter` timestamp on User model
   - Invalidates ALL tokens issued before this timestamp
   - More efficient for revoking all user tokens

### Activity Logging

All administrative actions are logged:
- Manual token revocations
- Security settings changes
- IP address and user information captured

### TTL Index

Revoked tokens are automatically deleted from the database after their expiry time, preventing database bloat.

---

## Frontend Integration

### Example: Fetch Security Dashboard

```javascript
const response = await fetch('/api/developer/security/dashboard', {
  headers: {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json'
  }
});

const data = await response.json();
console.log('Token Stats:', data.tokenStats);
console.log('Security Events:', data.securityEvents);
```

### Example: Revoke User Tokens

```javascript
const response = await fetch('/api/developer/security/revoke-tokens', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    userId: '507f1f77bcf86cd799439011',
    reason: 'security_incident'
  })
});

const result = await response.json();
console.log(result.message); // "All tokens revoked for user: John Doe"
```

### Example: Update Security Settings

```javascript
const response = await fetch('/api/developer/security/settings', {
  method: 'PUT',
  headers: {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    accountLockout: {
      maxLoginAttempts: 10,
      lockDuration: 60
    }
  })
});

const result = await response.json();
console.log('Settings updated:', result.settings);
```

---

## Related Documentation

- `SECURITY_AUDIT_FINDINGS.md` - Original security issues
- `CREDENTIALS_ROTATION_GUIDE.md` - Credential rotation procedures
- `tests/jwt-revocation-test.js` - JWT revocation test suite

---

## Notes

- All endpoints require `protect` and `developer` middleware
- Pagination is limited to max 200 results per page
- IP addresses are captured from `req.ip` or `req.connection.remoteAddress`
- All times are in ISO 8601 format (UTC)
- Security settings use singleton pattern (only one document in collection)
