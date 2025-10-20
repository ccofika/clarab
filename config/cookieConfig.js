/**
 * SECURITY: Secure Cookie Configuration
 *
 * This configuration ensures that authentication cookies are protected against:
 * - CSRF attacks (sameSite: 'none' with CORS whitelist in production)
 * - MITM attacks (secure: true in production)
 * - Cookie injection (httpOnly: true)
 *
 * DEVELOPMENT: Uses HTTP-compatible cookies (secure: false, sameSite: 'lax')
 * PRODUCTION: Cross-domain compatible (clarab.onrender.com backend + claraf.vercel.app frontend)
 *              - secure: true (HTTPS only)
 *              - sameSite: 'none' (allows cross-domain cookies)
 *              - httpOnly: true (prevents XSS)
 *
 * NOTE: __Host- prefix is NOT used because it's incompatible with cross-domain setups.
 *       CORS whitelist in server.js provides domain-level security instead.
 */

const isProduction = process.env.NODE_ENV === 'production';

console.log(`🍪 Cookie Config: NODE_ENV = ${process.env.NODE_ENV}, isProduction = ${isProduction}`);

// SECURITY: Cookie options for JWT access token (15 minutes)
// Production: secure HTTPS cookies with cross-domain support
// Development: Standard cookies (HTTP compatible)
const getAccessTokenCookieOptions = () => ({
  httpOnly: true,
  secure: isProduction, // Production: HTTPS only, Development: HTTP allowed
  sameSite: isProduction ? 'none' : 'lax', // Production: cross-domain, Development: lax
  path: '/',
  maxAge: 15 * 60 * 1000, // 15 minutes
});

// SECURITY: Cookie options for refresh token (7 days)
// Production: secure HTTPS cookies with cross-domain support
// Development: Standard cookies (HTTP compatible)
const getRefreshTokenCookieOptions = () => ({
  httpOnly: true,
  secure: isProduction, // Production: HTTPS only, Development: HTTP allowed
  sameSite: isProduction ? 'none' : 'lax', // Production: cross-domain, Development: lax
  path: '/',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
});

// SECURITY: Cookie names (same for dev and prod - no __Host- prefix due to cross-domain)
const COOKIE_NAMES = {
  ACCESS_TOKEN: 'jwt',
  REFRESH_TOKEN: 'refreshToken'
};

module.exports = {
  getAccessTokenCookieOptions,
  getRefreshTokenCookieOptions,
  COOKIE_NAMES
};
