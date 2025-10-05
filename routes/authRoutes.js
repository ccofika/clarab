const express = require('express');
const passport = require('passport');
const {
  register,
  login,
  getProfile,
  googleCallback,
  setupPassword,
  updateProfile,
  changePassword,
  getAllUsers
} = require('../controllers/authController');
const { protect } = require('../middleware/auth');

const router = express.Router();

router.post('/register', register);
router.post('/login', login);
router.get('/profile', protect, getProfile);
router.put('/profile', protect, updateProfile);
router.put('/change-password', protect, changePassword);
router.post('/setup-password', setupPassword);
router.get('/users', protect, getAllUsers);

// Google OAuth routes with session: false for JWT
router.get('/google', (req, res, next) => {
  console.log('🎯 Google route hit, passport strategies:', passport._strategies ? Object.keys(passport._strategies) : 'none');
  passport.authenticate('google', {
    scope: ['profile', 'email'],
    session: false
  })(req, res, next);
});

router.get('/google/callback', (req, res, next) => {
  passport.authenticate('google', {
    session: false,
    failureRedirect: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/login?error=auth_failed`
  }, (err, user, info) => {
    if (err) return next(err);
    if (!user) return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/login?error=auth_failed`);
    req.user = user;
    googleCallback(req, res, next);
  })(req, res, next);
});

module.exports = router;
