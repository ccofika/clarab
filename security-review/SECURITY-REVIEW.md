# Clara Backend - Security Review

**Date:** 2026-02-22
**Scope:** Full codebase analysis of `D:/Clara/clarab`
**Stack:** Node.js / Express 5 / MongoDB / JWT / OAuth / Socket.io

---

## Executive Summary

Clara is a production-grade QA & Knowledge Base management platform. The codebase demonstrates **strong security awareness** in many areas (JWT algorithm pinning, timing attack mitigations, atomic lockout operations, refresh token rotation with reuse detection, Helmet headers, MongoDB sanitization). However, **7 critical**, **14 high**, **18 medium**, and several low/informational findings were identified across authentication, authorization, injection, configuration, WebSocket, and business logic domains.

---

## CRITICAL Findings (7)

### C1. Weak/Placeholder JWT Secret
**File:** `.env:3`
```
JWT_SECRET=your_jwt_secret_key_here
```
The JWT signing secret is a common placeholder string. Any attacker who guesses this can forge arbitrary tokens and impersonate any user, including admins.

**Remediation:** Generate a 256+ bit random secret: `openssl rand -base64 64`. Store in platform environment variables, not `.env`.

---

### C2. Weak/Placeholder Session Secret
**File:** `.env:12`
```
SESSION_SECRET=your_session_secret_key_here
```
Same issue as C1. Trivially guessable session secret.

**Remediation:** Same as C1.

---

### C3. Hardcoded Credentials in Git History
**Files:**
- `scripts/seedUsers.js:9-11` -- `admin123`, `john123`, `jane123`
- `scripts/createMebitAccounts.js:17,23` -- `Mebit2024!Admin`, `Mebit2024!Dev`
- `scripts/fixAccounts.js:15-17` -- `Mebit2025!Dev`
- `scripts/testDeveloperEndpoints.js:7-8` -- `Mebit2024!Dev`

All committed to git history. Even if changed since, old values are permanently recoverable.

**Remediation:** Rotate all exposed passwords immediately. Remove credentials from scripts, use env vars. Consider `git-filter-repo` to purge history.

---

### C4. JWT Access Token in OAuth Redirect URL
**File:** `controllers/authController.js:355, 484`
```javascript
const redirectUrl = `${frontendURL}/auth/callback?...&token=${accessToken}`;
```
Token exposed in browser history, server logs, proxy logs, and Referrer headers.

**Remediation:** Use a short-lived one-time authorization code exchanged via POST, or use `postMessage` API.

---

### C5. Slack OAuth Missing `state` Parameter (CSRF)
**File:** `controllers/authController.js:367-378`

No `state` parameter in Slack OAuth flow. Attacker can link their Slack account to a victim's Clara account.

**Remediation:** Generate a random `state`, store in httpOnly cookie, validate on callback.

---

### C6. Slack OAuth Callback Unauthenticated (Account Hijacking)
**File:** `routes/authRoutes.js:97`, `controllers/authController.js:390-491`

Combined with missing `state` (C5), the unauthenticated callback issues full JWT tokens for any user found by Slack email. Potential account hijacking vector.

**Remediation:** Add `protect` middleware to Slack callback, or implement proper `state` validation binding to the current user session.

---

### C7. No Ownership Check on Ticket Delete/Grade/Bulk Delete
**File:** `controllers/qaController.js:1007-1021` (delete), `1050-1085` (grade), `1026-1045` (bulk delete)
```javascript
// No createdBy check
const ticket = await Ticket.findByIdAndDelete(req.params.id);
```
Any QA user can delete or grade ANY ticket in the system by knowing its ID.

**Remediation:** Add `{ _id: req.params.id, createdBy: req.user._id }` to all ticket mutation queries, or add explicit ownership verification.

---

## HIGH Findings (14)

| # | Finding | File(s) |
|---|---------|---------|
| H1 | **SSRF in `fetchMetadata`** -- User-controlled URL fetched without blocking internal IPs (127.0.0.1, 169.254.169.254, 10.x.x.x). Follows redirects without depth limit. | `controllers/kbExtendedController.js:1101-1175` |
| H2 | **Mass assignment in workspace update** -- `req.body` passed directly to `findByIdAndUpdate`. Fields like `owner` could be modified. | `controllers/workspaceController.js:160-163` |
| H3 | **Dynamic field name in statistics query** -- Both `field` and `value` from user input used in MongoDB query. Query arbitrary document fields. | `controllers/statisticsController.js:109` |
| H4 | **`getAllUsers` accessible to any authenticated user** -- Any `role: user` can enumerate all user IDs, names, and emails. | `routes/authRoutes.js:44`, `controllers/authController.js:668-678` |
| H5 | **Raw `error.message` returned to clients** -- 13+ locations return internal error details in 500 responses. Can leak DB structure, paths, config. | `controllers/authController.js:97,302,327,545...` |
| H6 | **`sameSite: 'none'` with no CSRF protection** -- No CSRF tokens, no custom header checks. HTML form POSTs bypass CORS. | `config/cookieConfig.js:29,40` |
| H7 | **WebSocket edit/delete messages lack authorization** -- Any channel member can edit/delete any message (no ownership check). | `sockets/chatHandlers.js:162-193` |
| H8 | **WebSocket channel events trust client data** -- `chat:channel:created/delete` accept unverified client payloads. Any user can delete any channel. | `sockets/chatHandlers.js:381-437` |
| H9 | **No rate limiting on WebSocket events** -- Unlimited message/typing/cursor spam possible. | `sockets/chatHandlers.js`, `sockets/workspaceHandlers.js` |
| H10 | **User presence broadcast to ALL sockets** -- `io.emit()` leaks online status to users not sharing any workspace/channel. | `sockets/chatHandlers.js:497` |
| H11 | **Image MIME validation spoofable + SVG allowed** -- Client-controlled `Content-Type` used for validation. SVG files can contain embedded JavaScript (XSS). | `controllers/imageController.js:13-16, 42` |
| H12 | **Stack traces leaked when `NODE_ENV=development`** -- `.env` has `NODE_ENV=development`. Full stack traces in all error responses. | `server.js:245-259`, `.env:4` |
| H13 | **Intercom scraper cookies stored unencrypted on disk** -- Plaintext JSON in user home directory. | `services/intercomScraperService.js:35,530` |
| H14 | **Transaction lookup has NO authentication** -- Completely open endpoint. | `routes/transactionRoutes.js:9` |

---

## MEDIUM Findings (18)

| # | Finding | File(s) |
|---|---------|---------|
| M1 | **ReDoS via unsanitized `$regex`** -- User input passed to MongoDB `$regex` without escaping metacharacters. 10+ controllers affected. | `userController.js:374`, `chatController.js:846`, `qaController.js:627`, `developerController.js:257,428`, `kbExtendedController.js:407`, `canvasController.js:434`, etc. |
| M2 | **Stored XSS risk** -- KB pages, chat messages, canvas elements stored without server-side HTML sanitization. Relies entirely on frontend. | `canvasController.js:138`, `knowledgeBaseController.js:123`, `chatController.js:392` |
| M3 | **Prototype pollution via spread `req.body`** -- `...req.body` in `create()` calls. `__proto__`/`constructor` keys not stripped by mongo-sanitize. | `canvasController.js:138`, `qaController.js:335,707` |
| M4 | **OAuth tokens stored in plaintext in DB** -- Google/Slack tokens unencrypted. If DB compromised, immediate access to all OAuth accounts. | `models/User.js:36-43`, `config/passport.js:35-39` |
| M5 | **OAuth tokens exposed in API response** -- `getProfile` selects `-password` but NOT `-googleAccessToken -slackAccessToken`. Full tokens returned. | `controllers/authController.js:309-325` |
| M6 | **Login rate limit too generous (50/15min)** -- Combined with `skipSuccessfulRequests`, enables credential stuffing at 50 attempts/IP/15min. | `middleware/rateLimiters.js:9` |
| M7 | **Missing `trust proxy`** -- Behind Render proxy, rate limiting uses proxy IP, not client IP. All users share one rate limit bucket. | `server.js` (absent) |
| M8 | **Agent issues endpoint has no ownership check** -- Unlike `getAgent`, `getAgentIssues` allows any QA user to see any agent's issues. | `controllers/qaController.js:112-135` |
| M9 | **User enumeration via registration** -- `"User already exists"` response reveals registered emails. | `controllers/authController.js:53-55` |
| M10 | **No general API rate limiting** -- Only auth endpoints rate-limited. All other endpoints vulnerable to abuse. | `server.js:161-165` |
| M11 | **10MB body parser limit** -- Generous JSON limit enables memory exhaustion DoS. | `server.js:106-107` |
| M12 | **No pagination limit cap** -- Multiple endpoints accept unlimited `limit` query parameter. | `chatController.js:275`, `kbExtendedController.js:176`, `knowledgeBaseController.js:484` |
| M13 | **Image delete without ownership check** -- Any user can delete any Cloudinary image by `publicId`. | `controllers/imageController.js:110-170` |
| M14 | **Workspace socket join without membership check** -- Any user can join any workspace room. | `sockets/workspaceHandlers.js:11-47` |
| M15 | **No input validation on socket payloads** -- All socket events accept raw unvalidated data. | `sockets/chatHandlers.js`, `sockets/workspaceHandlers.js` |
| M16 | **Hardcoded privileged emails** -- Admin/TL/special emails hardcoded in 6+ files instead of database/config. | `middleware/auth.js:145`, `chatController.js:11-16`, `qaController.js:726-727`, etc. |
| M17 | **KB template mass assignment** -- `findByIdAndUpdate(id, req.body)` without field filtering. | `controllers/kbExtendedController.js:72-74` |
| M18 | **Missing input validation on many endpoints** -- Chat, canvas, activity, bulk QA operations lack Joi validation. | `routes/chatRoutes.js`, `routes/canvasRoutes.js`, `routes/qaRoutes.js:328-335` |

---

## LOW Findings (10)

| # | Finding | File(s) |
|---|---------|---------|
| L1 | CORS allows null origin (no-origin requests bypass CORS) | `server.js:77-80` |
| L2 | `clearCookie` missing matching options (cookies may not be cleared) | `authController.js:885-886,925-926` |
| L3 | Google OAuth missing `hd` parameter (defense in depth) | `config/passport.js:11-14` |
| L4 | bcrypt cost factor 10 (OWASP recommends 12+) | `models/User.js:177` |
| L5 | Refresh token uses UUID v4 instead of `crypto.randomBytes` | `models/RefreshToken.js:85` |
| L6 | `jwt.sign` doesn't explicitly specify algorithm (defaults to HS256) | `authController.js:25-29` |
| L7 | Null dereference risk in Slack callback (`slackEmail?.endsWith`) | `authController.js:444-447` |
| L8 | Chat file upload has no MIME type filter (accepts any file up to 50MB) | `controllers/chatController.js:1280-1286` |
| L9 | Missing timeouts on blockchain API calls (hang indefinitely) | `services/blockchains/*.js` |
| L10 | `console.log` throughout codebase bypasses Winston logger sanitization | Multiple files |

---

## Positive Security Patterns (Keep These)

| Pattern | Location |
|---------|----------|
| JWT algorithm pinning to HS256 in `verify()` | `middleware/auth.js:29` |
| Timing attack mitigation (dummy hash + artificial delay) | `authController.js:17-20, 102-131` |
| Atomic account lockout with MongoDB `findOneAndUpdate` | `models/User.js:197-263` |
| Refresh token rotation with family reuse detection | `models/RefreshToken.js:148-195` |
| Two-tier token revocation (JTI blacklist + `tokenValidAfter`) | `models/RevokedToken.js`, `middleware/auth.js:52-67` |
| TTL indexes for automatic token cleanup | `models/RefreshToken.js`, `models/RevokedToken.js` |
| Joi validation with `stripUnknown: true` | `middleware/validation.js:363` |
| Role hardcoded to `user` on registration | `authController.js:63` |
| Helmet security headers + CSP | `server.js:52-65` |
| MongoDB sanitization via `express-mongo-sanitize` | `server.js:149-153` |
| Socket authentication with JWT verification | `server.js:287-338` |
| httpOnly cookies for JWT tokens | `config/cookieConfig.js:27,38` |

---

## Priority Remediation Plan

### Immediate (Before Next Deploy)

1. **Replace placeholder JWT/Session secrets** with cryptographically random values (C1, C2)
2. **Rotate all passwords** exposed in git history (C3)
3. **Add ownership checks** to ticket delete/grade/update operations (C7)
4. **Add authentication** to transaction lookup endpoint (H14)
5. **Set `NODE_ENV=production`** on deployment platform (H12)

### Short-Term (1-2 Weeks)

6. **Fix Slack OAuth** -- add `state` parameter and authentication to callback (C5, C6)
7. **Move JWT from URL to secure transport** in OAuth callbacks (C4)
8. **Add CSRF protection** -- custom header check or double-submit cookie (H6)
9. **Add authorization to WebSocket events** -- message edit/delete ownership, channel mutations, workspace join (H7, H8, M14)
10. **Add WebSocket rate limiting** (H9)
11. **Block internal IPs in `fetchMetadata`** SSRF protection (H1)
12. **Create `escapeRegex()` utility** and apply to all `$regex` uses (M1)
13. **Add `trust proxy` setting** for correct rate limiting (M7)
14. **Remove SVG from allowed image formats**, validate by magic bytes not MIME (H11)

### Medium-Term (1 Month)

15. **Add `toJSON` transform** to User model stripping sensitive fields (M5)
16. **Replace `error.message` responses** with generic messages in production (H5)
17. **Add field allowlisting** to all `findByIdAndUpdate(id, req.body)` calls (H2, M3, M17)
18. **Add server-side HTML sanitization** for stored content (M2)
19. **Encrypt OAuth tokens at rest** in database (M4)
20. **Add Joi validation** to chat, canvas, activity, and bulk QA routes (M18)
21. **Cap pagination limits** on all list endpoints (M12)
22. **Reduce body parser limit** to 1MB default, route-specific overrides (M11)
23. **Scope presence broadcasts** to shared channels/workspaces only (H10)
24. **Add rate limiting** to search and general API endpoints (M10)

### Long-Term (Ongoing)

25. **Move hardcoded emails** to database configuration (M16)
26. **Replace `console.log`** with structured Winston logging throughout (L10)
27. **Add request timeouts** to all external API calls (L9)
28. **Increase bcrypt cost factor** to 12 (L4)
29. **Implement data retention policies** for refresh tokens and login attempts
30. **Regular dependency audits** via `npm audit`

---

## Findings Count Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 7 |
| HIGH | 14 |
| MEDIUM | 18 |
| LOW | 10 |
| **Total** | **49** |
