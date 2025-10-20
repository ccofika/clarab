# Production Deployment Guide - Render.com

## Critical Environment Variables

Your backend is currently deployed on Render.com at `clarab.onrender.com`. To ensure cookies are secured properly in production, you MUST set the following environment variable:

### 1. Set NODE_ENV to 'production'

**On Render.com Dashboard:**

1. Go to https://dashboard.render.com
2. Click on your service: `clarab` (or whatever you named your backend)
3. Click on **Environment** in the left sidebar
4. Click **Add Environment Variable**
5. Add:
   - **Key**: `NODE_ENV`
   - **Value**: `production`
6. Click **Save Changes**
7. Your service will automatically redeploy

### 2. Verify All Required Environment Variables

Make sure these are all set on Render.com:

```
NODE_ENV=production
JWT_SECRET=your-super-secret-jwt-key-here
JWT_REFRESH_SECRET=your-super-secret-refresh-key-here
MONGO_URI=your-mongodb-connection-string
FRONTEND_URL=https://claraf.vercel.app
GOOGLE_CLIENT_ID=your-google-oauth-client-id
GOOGLE_CLIENT_SECRET=your-google-oauth-client-secret
CLOUDINARY_CLOUD_NAME=your-cloudinary-cloud-name
CLOUDINARY_API_KEY=your-cloudinary-api-key
CLOUDINARY_API_SECRET=your-cloudinary-api-secret
```

## What This Fixes

### Cookie Security Configuration

**Before (Development):**
```javascript
// Cookie names: 'jwt', 'refreshToken'
// secure: false (allows HTTP)
// sameSite: 'lax' (local development only)
```

**After (Production):**
```javascript
// Cookie names: 'jwt', 'refreshToken' (same, no __Host- due to cross-domain)
// secure: true (HTTPS only) ✅
// sameSite: 'none' (allows cross-domain: clarab.onrender.com → claraf.vercel.app) ✅
// httpOnly: true (prevents XSS) ✅
```

## Cross-Domain Cookie Architecture

Your setup:
- **Backend**: `clarab.onrender.com` (Render.com)
- **Frontend**: `claraf.vercel.app` (Vercel)

**Important**: The `__Host-` cookie prefix is NOT compatible with cross-domain setups because it requires cookies to be set for the exact domain only. Instead, we use:

1. `secure: true` - HTTPS only (prevents MITM attacks)
2. `sameSite: 'none'` - Allows cross-domain cookies
3. `httpOnly: true` - Prevents XSS attacks
4. CORS whitelist in `server.js` - Restricts which domains can access your API

This provides equivalent security to `__Host-` prefix for cross-domain scenarios.

## Debug Logging

After redeployment, check the Render.com logs. You should see:

```
🍪 Cookie Config: NODE_ENV = production, isProduction = true
🍪 Login - Cookie Configuration: {
  accessTokenName: 'jwt',
  refreshTokenName: 'refreshToken',
  accessTokenOptions: { httpOnly: true, secure: true, sameSite: 'none', ... },
  refreshTokenOptions: { httpOnly: true, secure: true, sameSite: 'none', ... },
  nodeEnv: 'production'
}
```

**If you see `isProduction = false`**, then NODE_ENV is not set correctly.

## Testing After Deployment

1. **Clear all cookies** from `clarab.onrender.com` in your browser
2. Log in to your app at `https://claraf.vercel.app`
3. Open DevTools → Application → Cookies → `clarab.onrender.com`
4. Verify cookies now show:
   - ✅ `Secure` column checked
   - ✅ `SameSite` = `None`
   - ✅ `HttpOnly` column checked

## Token Refresh After 15 Minutes

The access token expires after 15 minutes. The refresh mechanism:

1. Frontend axios interceptor detects 401 error
2. Automatically calls `/api/auth/refresh` with refresh token cookie
3. Backend rotates refresh token (generates new one)
4. Sets new `jwt` and `refreshToken` cookies
5. Retries original failed request with new access token

**With `sameSite: 'none'` and `secure: true`**, cookies will be sent in cross-domain requests from Vercel to Render.

## Troubleshooting

### Problem: Cookies still not secure after deployment

**Solution**: Check Render.com logs for the console.log output:
```bash
🍪 Cookie Config: NODE_ENV = production, isProduction = true
```

If it shows `isProduction = false`, NODE_ENV is not set.

### Problem: Token refresh fails with 401 after 15 minutes

**Possible causes**:
1. `sameSite: 'strict'` blocking cross-domain cookies → FIXED (now `'none'` in production)
2. `secure: true` but backend not using HTTPS → Render.com uses HTTPS by default ✅
3. CORS blocking `/api/auth/refresh` → Check `server.js` has `https://claraf.vercel.app` in whitelist ✅

### Problem: Frontend shows "Token refresh failed"

**Check**:
1. Are cookies visible in DevTools under `clarab.onrender.com`?
2. Are they marked as `Secure` and `SameSite: None`?
3. Check Render.com logs for any errors during `/api/auth/refresh`

## Security Notes

**Why no `__Host-` prefix?**
- `__Host-` requires cookies to be set on the exact domain without subdomain/port/protocol variations
- This is incompatible with cross-domain setups where frontend (Vercel) calls backend (Render)
- Our security model uses:
  - CORS whitelist (only `claraf.vercel.app` can call API)
  - `secure: true` (HTTPS only)
  - `httpOnly: true` (no JavaScript access)
  - `sameSite: 'none'` (cross-domain allowed, but only with `secure: true`)

This provides equivalent security for your architecture.

**Why `sameSite: 'none'` instead of `'strict'`?**
- `'strict'` blocks ALL cross-domain cookies
- Your frontend (`claraf.vercel.app`) and backend (`clarab.onrender.com`) are different domains
- `'none'` allows cross-domain cookies BUT only when `secure: true` (HTTPS)
- CORS whitelist ensures only your Vercel frontend can access the API

## Summary Checklist

- [ ] Set `NODE_ENV=production` on Render.com
- [ ] Verify all environment variables are set
- [ ] Redeploy the service (happens automatically when env vars change)
- [ ] Check Render.com logs for `isProduction = true`
- [ ] Clear browser cookies and test login
- [ ] Verify cookies show `Secure` and `SameSite: None` in DevTools
- [ ] Wait 15+ minutes and verify token refresh works automatically
