const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/User');
const { createDefaultQuickLinks } = require('../utils/createDefaultQuickLinks');

module.exports = function(passport) {
  // Configure Google Strategy if credentials are provided
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    console.log('✅ Google OAuth configured successfully');

    passport.use('google', new GoogleStrategy({
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:5000/api/auth/google/callback'
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails[0].value;

        // Check if email is from @mebit.io domain
        if (!email.endsWith('@mebit.io')) {
          return done(null, false, { message: 'Only @mebit.io email addresses are allowed' });
        }

        // Check if user already exists
        let user = await User.findOne({ email });

        if (user) {
          // Update googleId if not set
          if (!user.googleId) {
            user.googleId = profile.id;
            await user.save();
          }
          return done(null, user);
        }

        // Create new user with Google profile
        user = await User.create({
          name: profile.displayName,
          email: email,
          googleId: profile.id,
          isFirstLogin: true
        });

        // Create default quick links for new user
        await createDefaultQuickLinks(user._id);

        done(null, user);
      } catch (error) {
        done(error, null);
      }
    }));

    console.log('📝 Google strategy registered on passport instance');
  } else {
    console.warn('⚠️  Warning: Google OAuth is not configured');
    console.warn('    Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env file');
    console.warn('    Get credentials from: https://console.cloud.google.com/');
  }
};
