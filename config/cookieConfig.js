/**
 * SECURITY: Secure Cookie Configuration
 *
 * This configuration ensures that authentication cookies are protected against:
 * - CSRF attacks (sameSite: 'strict')
 * - MITM attacks (secure: true in production)
 * - Cookie injection (httpOnly: true)
 * - Subdomain attacks (__Host- prefix in production)
 *
 * DEVELOPMENT: Uses HTTP-compatible cookies (secure: false, no __Host- prefix)
 * PRODUCTION: Uses maximum security (secure: true, __Host- prefix)
 */

const isProduction = process.env.NODE_ENV === 'production';

// SECURITY: Cookie options for JWT access token (15 minutes)
// Production: __Host- prefix for maximum security
// Development: Standard cookies (HTTP compatible)
const getAccessTokenCookieOptions = () => ({
  httpOnly: true,
  secure: isProduction, // Production: HTTPS only, Development: HTTP allowed
  sameSite: 'strict', // Maximum CSRF protection
  path: '/',
  maxAge: 15 * 60 * 1000, // 15 minutes
});

// SECURITY: Cookie options for refresh token (7 days)
// Production: __Host- prefix for maximum security
// Development: Standard cookies (HTTP compatible)
const getRefreshTokenCookieOptions = () => ({
  httpOnly: true,
  secure: isProduction, // Production: HTTPS only, Development: HTTP allowed
  sameSite: 'strict', // Maximum CSRF protection
  path: '/',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
});

// SECURITY: Cookie names
// Production: __Host- prefix (requires HTTPS, exact domain, path=/)
// Development: Standard names (HTTP compatible)
const COOKIE_NAMES = {
  ACCESS_TOKEN: isProduction ? '__Host-jwt' : 'jwt',
  REFRESH_TOKEN: isProduction ? '__Host-refreshToken' : 'refreshToken'
};

module.exports = {
  getAccessTokenCookieOptions,
  getRefreshTokenCookieOptions,
  COOKIE_NAMES
};
