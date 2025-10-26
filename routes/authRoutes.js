const express = require('express');
const passport = require('passport');
const {
  register,
  login,
  getProfile,
  googleCallback,
  slackOAuthInitiate,
  slackCallback,
  setupPassword,
  updateProfile,
  changePassword,
  getAllUsers,
  createPrivilegedUser,
  updateUserRole,
  refreshToken,
  logout,
  logoutAll,
  unlockAccount
} = require('../controllers/authController');
const { protect, admin } = require('../middleware/auth');
const {
  loginLimiter,
  registerLimiter,
  refreshLimiter,
  changePasswordLimiter
} = require('../middleware/rateLimiters');
const { validate } = require('../middleware/validation');

const router = express.Router();

// Public routes with validation and rate limiting
router.post('/register', registerLimiter, validate('register'), register);
router.post('/login', loginLimiter, validate('login'), login);

// Token refresh route (public - uses refresh token from cookie)
router.post('/refresh', refreshLimiter, refreshToken);

// Protected routes with validation
router.get('/profile', protect, getProfile);
router.put('/profile', protect, validate('updateProfile'), updateProfile);
router.put('/change-password', protect, changePasswordLimiter, validate('changePassword'), changePassword);
router.post('/setup-password', protect, validate('setupPassword'), setupPassword);
router.get('/users', protect, getAllUsers);
router.post('/logout', protect, logout);
router.post('/logout-all', protect, logoutAll);

// Admin only routes with validation (no rate limiting - already protected by JWT and admin middleware)
router.post('/admin/create-user', protect, admin, validate('createPrivilegedUser'), createPrivilegedUser);
router.put('/admin/update-role', protect, admin, validate('updateUserRole'), updateUserRole);
router.post('/admin/unlock-account', protect, admin, unlockAccount);

// Google OAuth routes with session: false for JWT
router.get('/google', (req, res, next) => {
  console.log('🎯 Google route hit');
  passport.authenticate('google', {
    scope: [
      'profile',
      'email',
      'https://www.googleapis.com/auth/spreadsheets.readonly'
    ],
    accessType: 'offline',
    prompt: 'consent',
    session: false
  })(req, res, next);
});

router.get('/google/callback', (req, res, next) => {
  console.log('🔄 Google callback hit');

  passport.authenticate('google', {
    session: false,
    failureRedirect: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/login?error=auth_failed`
  }, (err, user, info) => {
    console.log('📋 Google auth result received');

    if (err) {
      console.error('❌ Google OAuth error:', err);
      return next(err);
    }

    if (!user) {
      console.warn('⚠️  No user returned from Google auth, info:', info);
      return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/login?error=auth_failed`);
    }

    console.log('✅ Google auth successful');
    req.user = user;
    googleCallback(req, res, next);
  })(req, res, next);
});

// Slack OAuth routes - Custom implementation following Slack documentation
// https://docs.slack.dev/authentication/installing-with-oauth
router.get('/slack', slackOAuthInitiate);
router.get('/slack/callback', slackCallback);

module.exports = router;
