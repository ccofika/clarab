const GoogleStrategy = require('passport-google-oauth20').Strategy;
const SlackStrategy = require('passport-slack-oauth2').Strategy;
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
          console.warn('⚠️  Email not from @mebit.io domain');
          return done(null, false, { message: 'Only @mebit.io email addresses are allowed' });
        }

        // Check if user already exists
        let user = await User.findOne({ email });

        if (user) {
          // Update googleId and tokens if not set
          if (!user.googleId) {
            user.googleId = profile.id;
          }
          // Always update access token
          user.googleAccessToken = accessToken;
          // Update refresh token if provided (not always sent)
          if (refreshToken) {
            user.googleRefreshToken = refreshToken;
          }
          await user.save();
          return done(null, user);
        }

        // Create new user with Google profile
        user = await User.create({
          name: profile.displayName,
          email: email,
          googleId: profile.id,
          googleAccessToken: accessToken,
          googleRefreshToken: refreshToken,
          isFirstLogin: true
        });

        // Create default quick links for new user
        await createDefaultQuickLinks(user._id);

        done(null, user);
      } catch (error) {
        console.error('❌ Google Strategy error:', error);
        done(error, null);
      }
    }));

    console.log('📝 Google strategy registered on passport instance');
  } else {
    console.warn('⚠️  Warning: Google OAuth is not configured');
    console.warn('    Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env file');
    console.warn('    Get credentials from: https://console.cloud.google.com/');
  }

  // Configure Slack Strategy if credentials are provided
  if (process.env.SLACK_CLIENT_ID && process.env.SLACK_CLIENT_SECRET) {
    console.log('✅ Slack OAuth configured successfully');

    passport.use('slack', new SlackStrategy({
      clientID: process.env.SLACK_CLIENT_ID,
      clientSecret: process.env.SLACK_CLIENT_SECRET,
      callbackURL: process.env.SLACK_CALLBACK_URL || 'http://localhost:5000/auth/slack/callback',
      scope: ['users:read', 'chat:write']
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.user.email;

        // Check if email is from @mebit.io domain
        if (!email.endsWith('@mebit.io')) {
          console.warn('⚠️  Slack email not from @mebit.io domain');
          return done(null, false, { message: 'Only @mebit.io email addresses are allowed' });
        }

        // Find user by email (should already exist from Google OAuth)
        let user = await User.findOne({ email });

        if (!user) {
          return done(null, false, { message: 'User not found. Please sign in with Google first.' });
        }

        // Update Slack tokens and info
        user.slackAccessToken = accessToken;
        user.slackUserId = profile.user.id;
        user.slackTeamId = profile.team.id;
        user.slackTeamName = profile.team.name;

        await user.save();

        return done(null, user);
      } catch (error) {
        console.error('❌ Slack Strategy error:', error);
        done(error, null);
      }
    }));

    console.log('📝 Slack strategy registered on passport instance');
  } else {
    console.warn('⚠️  Warning: Slack OAuth is not configured');
    console.warn('    Please set SLACK_CLIENT_ID and SLACK_CLIENT_SECRET in .env file');
    console.warn('    Get credentials from: https://api.slack.com/apps');
  }
};
