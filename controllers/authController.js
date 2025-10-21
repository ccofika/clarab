const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const RefreshToken = require('../models/RefreshToken');
const RevokedToken = require('../models/RevokedToken');
const LoginAttempt = require('../models/LoginAttempt');
const { createDefaultQuickLinks } = require('../utils/createDefaultQuickLinks');
const { logActivity } = require('../utils/activityLogger');
const logger = require('../utils/logger');
const {
  getAccessTokenCookieOptions,
  getRefreshTokenCookieOptions,
  COOKIE_NAMES
} = require('../config/cookieConfig');

// SECURITY: Pre-computed dummy hash for timing attack mitigation
// This ensures bcrypt.compare() is ALWAYS called, even for non-existent users
// Without this, attackers could enumerate valid emails by measuring response time
const DUMMY_PASSWORD_HASH = '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';

// Generate Access Token (JWT) - 15 minutes
const generateAccessToken = (id) => {
  const jti = crypto.randomBytes(16).toString('hex'); // Unique token ID for revocation
  return jwt.sign(
    { id, jti },
    process.env.JWT_SECRET,
    { expiresIn: '15m' }
  );
};

// Generate and store Refresh Token - 7 days
const generateAndStoreRefreshToken = async (userId, req) => {
  const ipAddress = req.ip || req.connection.remoteAddress;
  const userAgent = req.get('user-agent') || '';

  // Generate refresh token and store in database
  const refreshToken = await RefreshToken.generateRefreshToken(
    userId,
    ipAddress,
    userAgent
  );

  return refreshToken.token;
};

// Register User
exports.register = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Check if user exists
    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ message: 'User already exists' });
    }

    // Create user with 'user' role (security: role cannot be set via registration)
    const user = await User.create({
      name,
      email,
      password,
      role: 'user' // Hardcoded to prevent privilege escalation
    });

    if (user) {
      // Create default quick links for new user
      await createDefaultQuickLinks(user._id);

      // Generate access token and refresh token
      const accessToken = generateAccessToken(user._id);
      const refreshToken = await generateAndStoreRefreshToken(user._id, req);

      // SECURITY: Set secure cookies with __Host- prefix
      res.cookie(COOKIE_NAMES.ACCESS_TOKEN, accessToken, getAccessTokenCookieOptions());
      res.cookie(COOKIE_NAMES.REFRESH_TOKEN, refreshToken, getRefreshTokenCookieOptions());

      // Log successful registration
      await logActivity({
        level: 'info',
        message: 'New user registered',
        module: 'authController',
        user: user._id,
        metadata: { email: user.email, name: user.name, role: user.role },
        req
      });

      res.status(201).json({
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        token: accessToken
      });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// SECURITY: Artificial delay to normalize response times (timing attack mitigation)
const addTimingDelay = async () => {
  // Random delay between 100-150ms to prevent timing analysis
  const delay = 100 + Math.floor(Math.random() * 51);
  await new Promise(resolve => setTimeout(resolve, delay));
};

// Login User
exports.login = async (req, res) => {
  try {
    logger.auth('login_attempt', { email: req.body.email });
    const { email, password } = req.body;
    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.get('user-agent') || '';

    // SECURITY: Step 1 - Always perform user lookup and password comparison in constant time
    // This prevents timing attacks that could enumerate valid email addresses
    const user = await User.findOne({ email });

    // SECURITY: Step 2 - ALWAYS perform bcrypt comparison (even for non-existent users)
    // This ensures constant-time behavior regardless of user existence
    let isPasswordValid = false;
    if (user && user.password) {
      // Real user - compare against real password hash
      isPasswordValid = await bcrypt.compare(password, user.password);
    } else {
      // Non-existent user or no password - compare against dummy hash
      // This takes the same time as a real comparison, preventing timing attacks
      await bcrypt.compare(password, DUMMY_PASSWORD_HASH);
      isPasswordValid = false; // Always false for non-existent users
    }

    // SECURITY: Step 3 - Check if user exists (after timing-sensitive operations)
    if (!user) {
      logger.auth('login_failed_user_not_found', { email });
      await LoginAttempt.logAttempt(email, ipAddress, false, 'user_not_found', userAgent);
      await logActivity({
        level: 'warn',
        message: 'Failed login attempt - user not found',
        module: 'authController',
        metadata: { email, ipAddress },
        req
      });

      // Add artificial delay before responding
      await addTimingDelay();
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    logger.auth('user_found', { userId: user._id, role: user.role });

    // SECURITY: Step 4 - Check if account is locked (before password validation)
    if (user.isLocked) {
      const lockTimeRemaining = Math.ceil((user.lockUntil - Date.now()) / 1000 / 60); // minutes

      // Log locked account attempt
      await LoginAttempt.logAttempt(email, ipAddress, false, 'account_locked', userAgent);
      await logActivity({
        level: 'warn',
        message: `Login attempt on locked account: "${user.name} | ${user._id}"`,
        module: 'authController',
        user: user._id,
        metadata: {
          email: user.email,
          ipAddress,
          lockTimeRemaining: `${lockTimeRemaining} minutes`,
          loginAttempts: user.loginAttempts
        },
        req
      });

      logger.auth('account_locked_attempt', { userId: user._id, lockTimeRemaining });

      // Add artificial delay before responding
      await addTimingDelay();
      // SECURITY: Generic message without revealing exact lock time
      return res.status(401).json({
        message: 'Invalid email or password'
      });
    }

    // SECURITY: Step 5 - Check password validity (bcrypt comparison already done above)
    if (!isPasswordValid) {
      logger.auth('password_mismatch', { userId: user._id });

      // Increment login attempts and potentially lock account
      await user.incLoginAttempts();

      // Log failed attempt to database
      await LoginAttempt.logAttempt(email, ipAddress, false, 'incorrect_password', userAgent);

      // Reload user to get updated loginAttempts and lockUntil
      await user.reload();

      // Check if account just got locked
      if (user.isLocked) {
        const lockTimeRemaining = Math.ceil((user.lockUntil - Date.now()) / 1000 / 60);

        await logActivity({
          level: 'error',
          message: `Account locked after max failed attempts: "${user.name} | ${user._id}"`,
          module: 'authController',
          user: user._id,
          metadata: {
            email: user.email,
            ipAddress,
            loginAttempts: user.loginAttempts,
            lockDuration: `${lockTimeRemaining} minutes`
          },
          req
        });

        logger.auth('account_now_locked', { userId: user._id, attempts: user.loginAttempts });

        // Add artificial delay before responding
        await addTimingDelay();
        // SECURITY: Generic message without revealing lock state or time
        return res.status(401).json({
          message: 'Invalid email or password'
        });
      }

      // Log failed password attempt
      const attemptsLeft = 5 - user.loginAttempts;
      await logActivity({
        level: 'warn',
        message: `Failed login attempt - incorrect password: "${user.name} | ${user._id}"`,
        module: 'authController',
        user: user._id,
        metadata: {
          email: user.email,
          ipAddress,
          loginAttempts: user.loginAttempts,
          attemptsLeft
        },
        req
      });

      // Add artificial delay before responding
      await addTimingDelay();
      // SECURITY: Generic message without revealing attempts left
      return res.status(401).json({
        message: 'Invalid email or password'
      });
    }

    // Password is correct - proceed with successful login

    logger.auth('password_match', { userId: user._id });

    // Reset login attempts on successful login
    if (user.loginAttempts > 0 || user.lockUntil) {
      await user.resetLoginAttempts();
    }

    // Log successful attempt to database
    await LoginAttempt.logAttempt(email, ipAddress, true, null, userAgent);

    // Generate access token and refresh token
    const accessToken = generateAccessToken(user._id);
    const refreshToken = await generateAndStoreRefreshToken(user._id, req);

    // Get cookie options for logging
    const accessTokenOptions = getAccessTokenCookieOptions();
    const refreshTokenOptions = getRefreshTokenCookieOptions();

    // SECURITY: Set secure cookies
    res.cookie(COOKIE_NAMES.ACCESS_TOKEN, accessToken, accessTokenOptions);
    res.cookie(COOKIE_NAMES.REFRESH_TOKEN, refreshToken, refreshTokenOptions);

    // Log cookie configuration for debugging
    console.log('🍪 Login - Cookie Configuration:', {
      accessTokenName: COOKIE_NAMES.ACCESS_TOKEN,
      refreshTokenName: COOKIE_NAMES.REFRESH_TOKEN,
      accessTokenOptions,
      refreshTokenOptions,
      nodeEnv: process.env.NODE_ENV
    });

    logger.auth('login_success', { userId: user._id });

    // Log successful login
    await logActivity({
      level: 'info',
      message: `User logged in successfully: "${user.name} | ${user._id}"`,
      module: 'authController',
      user: user._id,
      metadata: {
        email: user.email,
        role: user.role,
        ipAddress
      },
      req
    });

    // Add artificial delay for successful logins too (constant-time)
    await addTimingDelay();

    res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      token: accessToken
    });
  } catch (error) {
    logger.error('Login error', { error: error.message, stack: error.stack });

    // Add artificial delay for errors too
    await addTimingDelay();
    res.status(500).json({ message: error.message });
  }
};

// Get User Profile
exports.getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');

    // SECURITY: If user authenticated with cookie (Google OAuth), also return token
    // This allows frontend to store it in localStorage for subsequent requests
    const authHeader = req.headers.authorization;
    const cookieToken = req.cookies[COOKIE_NAMES.ACCESS_TOKEN];

    // If authenticated via cookie (not Bearer token), generate and return token
    if (cookieToken && !authHeader) {
      const accessToken = generateAccessToken(user._id);
      return res.json({
        ...user.toObject(),
        token: accessToken
      });
    }

    res.json(user);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Google OAuth Callback
// SECURITY: Token sent via HTTP-only cookie instead of URL to prevent token exposure
// After Google login, automatically redirect to Slack OAuth for combined authentication
exports.googleCallback = async (req, res) => {
  try {
    const user = req.user;
    console.log('🎯 googleCallback executing for user:', user._id, user.email);

    // Generate access token and refresh token
    const accessToken = generateAccessToken(user._id);
    const refreshToken = await generateAndStoreRefreshToken(user._id, req);
    console.log('🔑 Tokens generated successfully');

    // Get cookie options for logging
    const accessTokenOptions = getAccessTokenCookieOptions();
    const refreshTokenOptions = getRefreshTokenCookieOptions();

    // SECURITY: Set secure cookies
    res.cookie(COOKIE_NAMES.ACCESS_TOKEN, accessToken, accessTokenOptions);
    res.cookie(COOKIE_NAMES.REFRESH_TOKEN, refreshToken, refreshTokenOptions);

    // Log cookie configuration
    console.log('🍪 Google OAuth - Cookie Configuration:', {
      accessTokenName: COOKIE_NAMES.ACCESS_TOKEN,
      refreshTokenName: COOKIE_NAMES.REFRESH_TOKEN,
      accessTokenOptions,
      refreshTokenOptions,
      nodeEnv: process.env.NODE_ENV
    });

    // Check if user already has Slack token
    if (user.slackAccessToken) {
      console.log('✅ User already has Slack token, redirecting to frontend');
      // User already connected to Slack, redirect to frontend
      const frontendURL = process.env.FRONTEND_URL || 'http://localhost:3000';
      const redirectUrl = `${frontendURL}/auth/callback?isFirstLogin=${user.isFirstLogin}&userId=${user._id}&success=true`;
      console.log('🔀 Redirecting to:', redirectUrl);
      return res.redirect(redirectUrl);
    }

    // Redirect to Slack OAuth for combined authentication
    console.log('🔗 Redirecting to Slack OAuth for combined authentication');
    const backendURL = process.env.BACKEND_URL || 'http://localhost:5000';
    const slackOAuthUrl = `${backendURL}/api/auth/slack`;
    console.log('🔀 Slack OAuth URL:', slackOAuthUrl);

    res.redirect(slackOAuthUrl);
  } catch (error) {
    console.error('❌ googleCallback error:', error);
    const frontendURL = process.env.FRONTEND_URL || 'http://localhost:3000';
    res.redirect(`${frontendURL}/login?error=${error.message}`);
  }
};

// Custom Slack OAuth - Initiate authorization
// Follows https://docs.slack.dev/authentication/installing-with-oauth
exports.slackOAuthInitiate = async (req, res) => {
  try {
    console.log('🎯 Slack OAuth initiate hit');

    const clientId = process.env.SLACK_CLIENT_ID;
    const callbackURL = process.env.SLACK_CALLBACK_URL || 'http://localhost:5000/api/auth/slack/callback';

    // User scopes according to Slack documentation
    const userScopes = 'chat:write,im:write,im:history,users:read,users:read.email,channels:history';

    // Construct authorization URL with user_scope parameter
    const authorizationURL = `https://slack.com/oauth/v2/authorize?client_id=${clientId}&user_scope=${userScopes}&redirect_uri=${encodeURIComponent(callbackURL)}`;

    console.log('🔀 Redirecting to Slack authorization:', authorizationURL);
    res.redirect(authorizationURL);
  } catch (error) {
    console.error('❌ Slack OAuth initiate error:', error);
    const frontendURL = process.env.FRONTEND_URL || 'http://localhost:3000';
    res.redirect(`${frontendURL}/login?error=slack_oauth_failed`);
  }
};

// Custom Slack OAuth Callback
// Handles callback and exchanges code for token
exports.slackCallback = async (req, res) => {
  try {
    const { code, error } = req.query;
    console.log('🔄 Slack callback hit, query params:', { code: code ? 'received' : 'missing', error });

    if (error) {
      console.error('❌ Slack OAuth error:', error);
      const frontendURL = process.env.FRONTEND_URL || 'http://localhost:3000';
      return res.redirect(`${frontendURL}/login?error=slack_${error}`);
    }

    if (!code) {
      console.error('❌ No code received from Slack');
      const frontendURL = process.env.FRONTEND_URL || 'http://localhost:3000';
      return res.redirect(`${frontendURL}/login?error=slack_no_code`);
    }

    // Exchange code for token following Slack documentation
    console.log('🔄 Exchanging code for token...');
    const axios = require('axios');
    const params = new URLSearchParams();
    params.append('code', code);
    params.append('client_id', process.env.SLACK_CLIENT_ID);
    params.append('client_secret', process.env.SLACK_CLIENT_SECRET);
    params.append('redirect_uri', process.env.SLACK_CALLBACK_URL || 'http://localhost:5000/api/auth/slack/callback');

    const tokenResponse = await axios.post('https://slack.com/api/oauth.v2.access', params, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    console.log('📥 Token response received:', {
      ok: tokenResponse.data.ok,
      hasAuthedUser: !!tokenResponse.data.authed_user
    });

    if (!tokenResponse.data.ok) {
      console.error('❌ Slack token exchange failed:', tokenResponse.data.error);
      const frontendURL = process.env.FRONTEND_URL || 'http://localhost:3000';
      return res.redirect(`${frontendURL}/login?error=slack_token_failed`);
    }

    // Extract user token from authed_user (Slack documentation format)
    const authedUser = tokenResponse.data.authed_user;
    if (!authedUser || !authedUser.access_token) {
      console.error('❌ No user token in response');
      const frontendURL = process.env.FRONTEND_URL || 'http://localhost:3000';
      return res.redirect(`${frontendURL}/login?error=slack_no_user_token`);
    }

    console.log('✅ User token received:', {
      userId: authedUser.id,
      scope: authedUser.scope,
      tokenType: authedUser.token_type
    });

    // Get user email from Slack
    const userInfoResponse = await axios.get('https://slack.com/api/users.info', {
      params: { user: authedUser.id },
      headers: { Authorization: `Bearer ${authedUser.access_token}` }
    });

    console.log('📋 User info response:', JSON.stringify(userInfoResponse.data, null, 2));

    if (!userInfoResponse.data.ok || !userInfoResponse.data.user) {
      console.error('❌ Failed to get user info from Slack:', userInfoResponse.data.error);
      const frontendURL = process.env.FRONTEND_URL || 'http://localhost:3000';
      return res.redirect(`${frontendURL}/login?error=slack_user_info_failed`);
    }

    const slackEmail = userInfoResponse.data.user?.profile?.email;
    console.log('📧 Slack email:', slackEmail);

    // Check if email is from @mebit.io domain
    if (!slackEmail.endsWith('@mebit.io')) {
      console.warn('⚠️  Slack email not from @mebit.io domain:', slackEmail);
      const frontendURL = process.env.FRONTEND_URL || 'http://localhost:3000';
      return res.redirect(`${frontendURL}/login?error=invalid_domain`);
    }

    // Find user by email
    const User = require('../models/User');
    let user = await User.findOne({ email: slackEmail });

    if (!user) {
      console.warn('⚠️  User not found for Slack OAuth:', slackEmail);
      const frontendURL = process.env.FRONTEND_URL || 'http://localhost:3000';
      return res.redirect(`${frontendURL}/login?error=user_not_found`);
    }

    console.log('✅ User found:', user._id);

    // Update Slack tokens
    user.slackAccessToken = authedUser.access_token;
    user.slackUserId = authedUser.id;
    user.slackTeamId = tokenResponse.data.team?.id;
    user.slackTeamName = tokenResponse.data.team?.name;
    await user.save();

    console.log('✅ Slack tokens saved:', {
      slackUserId: user.slackUserId,
      slackTeamId: user.slackTeamId,
      slackTeamName: user.slackTeamName
    });

    // Generate JWT tokens (same as Google callback)
    const accessToken = generateAccessToken(user._id);
    const refreshToken = await generateAndStoreRefreshToken(user._id, req);
    console.log('🔑 JWT tokens generated for Slack callback');

    // Get cookie options
    const accessTokenOptions = getAccessTokenCookieOptions();
    const refreshTokenOptions = getRefreshTokenCookieOptions();

    // Set secure cookies
    res.cookie(COOKIE_NAMES.ACCESS_TOKEN, accessToken, accessTokenOptions);
    res.cookie(COOKIE_NAMES.REFRESH_TOKEN, refreshToken, refreshTokenOptions);

    console.log('🍪 Slack OAuth - Cookies set:', {
      accessTokenName: COOKIE_NAMES.ACCESS_TOKEN,
      refreshTokenName: COOKIE_NAMES.REFRESH_TOKEN,
      nodeEnv: process.env.NODE_ENV
    });

    // Redirect to frontend with success
    const frontendURL = process.env.FRONTEND_URL || 'http://localhost:3000';
    const redirectUrl = `${frontendURL}/auth/callback?isFirstLogin=${user.isFirstLogin}&userId=${user._id}&success=true&slackConnected=true`;
    console.log('🔀 Redirecting to frontend:', redirectUrl);

    res.redirect(redirectUrl);
  } catch (error) {
    console.error('❌ slackCallback error:', error);
    const frontendURL = process.env.FRONTEND_URL || 'http://localhost:3000';
    res.redirect(`${frontendURL}/login?error=${error.message}`);
  }
};

// Setup Password for First Time Google Users
// SECURITY: Now requires JWT authentication - user can only set their own password
exports.setupPassword = async (req, res) => {
  try {
    const { password, confirmPassword } = req.body;

    if (!password || !confirmPassword) {
      return res.status(400).json({ message: 'Password and confirm password are required' });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ message: 'Passwords do not match' });
    }

    // Note: Password strength is now validated by Joi middleware
    // Requirements: 8+ chars, uppercase, lowercase, number, special char

    // SECURITY: Use authenticated user from JWT token (req.user) instead of userId from body
    const user = await User.findById(req.user._id);
    if (!user) {
      // NOTE: "User not found" is safe here because this is an authenticated endpoint
      // User already proved their identity via JWT, so this doesn't leak user enumeration info
      return res.status(404).json({ message: 'User not found' });
    }

    // Verify this is a first-time password setup
    if (user.password && !user.isFirstLogin) {
      return res.status(400).json({ message: 'Password already set. Use change password instead.' });
    }

    // Update password and mark as not first login
    user.password = password;
    user.isFirstLogin = false;
    await user.save();

    // Generate access token and refresh token
    const accessToken = generateAccessToken(user._id);
    const refreshToken = await generateAndStoreRefreshToken(user._id, req);

    // SECURITY: Set secure cookies with __Host- prefix
    res.cookie(COOKIE_NAMES.ACCESS_TOKEN, accessToken, getAccessTokenCookieOptions());
    res.cookie(COOKIE_NAMES.REFRESH_TOKEN, refreshToken, getRefreshTokenCookieOptions());

    res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      token: accessToken
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update User Profile
exports.updateProfile = async (req, res) => {
  try {
    const { name } = req.body;

    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (name) {
      user.name = name;
    }

    await user.save();

    res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Change Password
exports.changePassword = async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;

    if (!oldPassword || !newPassword) {
      return res.status(400).json({ message: 'Old password and new password are required' });
    }

    // Note: Password strength is now validated by Joi middleware
    // Requirements: 8+ chars, uppercase, lowercase, number, special char

    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check if user has a password (Google OAuth users might not have password initially)
    if (!user.password) {
      return res.status(400).json({ message: 'Please set up a password first' });
    }

    // Verify old password
    const isMatch = await user.comparePassword(oldPassword);
    if (!isMatch) {
      return res.status(401).json({ message: 'Current password is incorrect' });
    }

    // Update password
    user.password = newPassword;
    await user.save();

    const ipAddress = req.ip || req.connection.remoteAddress;

    // SECURITY: Set tokenValidAfter to NOW (invalidate all OLD tokens)
    // We'll issue new tokens AFTER this, so they'll be valid
    const revocationTimestamp = new Date();
    await User.findByIdAndUpdate(user._id, {
      $set: { tokenValidAfter: revocationTimestamp }
    });

    // Small delay to ensure new tokens have iat > tokenValidAfter
    await new Promise(resolve => setTimeout(resolve, 100)); // 100ms delay

    // SECURITY: Generate NEW tokens for current session (after tokenValidAfter is set)
    const newAccessToken = generateAccessToken(user._id);
    const newRefreshToken = await generateAndStoreRefreshToken(user._id, req);

    // Revoke all OLD refresh tokens except the one we just created
    await RefreshToken.updateMany(
      {
        user: user._id,
        token: { $ne: newRefreshToken }, // Don't revoke the NEW refresh token
        isRevoked: false
      },
      {
        $set: {
          isRevoked: true,
          revokedAt: new Date(),
          revokedByIp: ipAddress,
          revokeReason: 'Password changed - old sessions terminated'
        }
      }
    );

    // Set NEW cookies (keep user logged in with new credentials)
    res.cookie(COOKIE_NAMES.ACCESS_TOKEN, newAccessToken, getAccessTokenCookieOptions());
    res.cookie(COOKIE_NAMES.REFRESH_TOKEN, newRefreshToken, getRefreshTokenCookieOptions());

    // Log password change
    await logActivity({
      level: 'info',
      message: `Password changed and all old tokens revoked: "${user.name} | ${user._id}"`,
      module: 'authController',
      user: user._id,
      metadata: { ipAddress, newTokensIssued: true },
      req
    });

    res.json({
      message: 'Password changed successfully. All other sessions have been logged out.',
      token: newAccessToken,
      tokensRevoked: true
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get All Users (for workspace invitations)
exports.getAllUsers = async (req, res) => {
  try {
    const users = await User.find({})
      .select('_id name email')
      .sort({ name: 1 });

    res.json(users);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Admin Only: Create Admin or Developer User
exports.createPrivilegedUser = async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    // Validate role
    if (!['admin', 'developer'].includes(role)) {
      return res.status(400).json({ message: 'Role must be either admin or developer' });
    }

    // Check if user exists
    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ message: 'User already exists' });
    }

    // Create privileged user
    const user = await User.create({
      name,
      email,
      password,
      role
    });

    if (user) {
      // Create default quick links for new user
      await createDefaultQuickLinks(user._id);

      res.status(201).json({
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        message: `${role.charAt(0).toUpperCase() + role.slice(1)} user created successfully`
      });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Admin Only: Update User Role
exports.updateUserRole = async (req, res) => {
  try {
    const { userId, role } = req.body;

    // Validate role
    if (!['user', 'admin', 'developer'].includes(role)) {
      return res.status(400).json({ message: 'Invalid role' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Prevent changing own role
    if (user._id.toString() === req.user._id.toString()) {
      return res.status(403).json({ message: 'Cannot change your own role' });
    }

    user.role = role;
    await user.save();

    res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      message: 'User role updated successfully'
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// SECURITY: Refresh Access Token with Token Rotation
// This endpoint rotates the refresh token on each use to prevent token theft
exports.refreshToken = async (req, res) => {
  try {
    const refreshToken = req.cookies[COOKIE_NAMES.REFRESH_TOKEN];
    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.get('user-agent') || '';

    if (!refreshToken) {
      return res.status(401).json({ message: 'Refresh token not found' });
    }

    // Find refresh token in database
    const tokenDoc = await RefreshToken.findOne({ token: refreshToken });

    if (!tokenDoc) {
      return res.status(401).json({ message: 'Invalid refresh token' });
    }

    // SECURITY: Detect token reuse (possible theft)
    const reuseDetected = await RefreshToken.detectReuse(tokenDoc, ipAddress);
    if (reuseDetected) {
      logger.error('Token reuse detected - possible theft', {
        userId: tokenDoc.user,
        tokenFamily: tokenDoc.tokenFamily,
        ipAddress
      });

      // Log security incident
      await logActivity({
        level: 'error',
        message: 'SECURITY: Refresh token reuse detected - entire token family revoked',
        module: 'authController',
        user: tokenDoc.user,
        metadata: {
          tokenFamily: tokenDoc.tokenFamily,
          ipAddress,
          userAgent
        },
        req
      });

      return res.status(401).json({
        message: 'Token reuse detected. All sessions have been terminated for security.',
        securityIncident: true
      });
    }

    // Check if token is revoked
    if (tokenDoc.isRevoked) {
      return res.status(401).json({ message: 'Refresh token has been revoked' });
    }

    // Check if token is expired
    if (tokenDoc.isExpired) {
      return res.status(401).json({ message: 'Refresh token has expired' });
    }

    // SECURITY: Rotate the refresh token (generate new, mark old as replaced)
    const newRefreshTokenDoc = await RefreshToken.rotateToken(tokenDoc, ipAddress, userAgent);

    // Generate new access token
    const accessToken = generateAccessToken(tokenDoc.user);

    // SECURITY: Set secure cookies with __Host- prefix
    res.cookie(COOKIE_NAMES.ACCESS_TOKEN, accessToken, getAccessTokenCookieOptions());
    res.cookie(COOKIE_NAMES.REFRESH_TOKEN, newRefreshTokenDoc.token, getRefreshTokenCookieOptions());

    // Log token refresh and rotation
    await logActivity({
      level: 'info',
      message: 'Access token refreshed and refresh token rotated',
      module: 'authController',
      user: tokenDoc.user,
      metadata: {
        deviceType: tokenDoc.deviceInfo.deviceType,
        tokenFamily: tokenDoc.tokenFamily,
        oldTokenReplaced: true
      },
      req
    });

    res.json({
      token: accessToken,
      message: 'Token refreshed successfully'
    });
  } catch (error) {
    logger.error('Refresh token error', { error: error.message, stack: error.stack });
    res.status(500).json({ message: error.message });
  }
};

// Logout - Revoke current refresh token
exports.logout = async (req, res) => {
  try {
    const ipAddress = req.ip || req.connection.remoteAddress;
    const accessToken = req.cookies[COOKIE_NAMES.ACCESS_TOKEN] ||
                       (req.headers.authorization?.startsWith('Bearer') ?
                        req.headers.authorization.split(' ')[1] : null);
    const refreshToken = req.cookies[COOKIE_NAMES.REFRESH_TOKEN];

    // SECURITY: Revoke current access token (add to blacklist)
    if (accessToken && req.user) {
      try {
        const decoded = jwt.decode(accessToken);
        if (decoded && decoded.jti && decoded.iat && decoded.exp) {
          await RevokedToken.revokeToken(
            decoded.jti,
            req.user._id,
            decoded.iat,
            decoded.exp,
            'logout',
            ipAddress
          );
        }
      } catch (error) {
        logger.error('Error revoking access token', { error: error.message });
      }
    }

    // Revoke refresh token (if exists)
    if (refreshToken) {
      const tokenDoc = await RefreshToken.findOne({ token: refreshToken });
      if (tokenDoc && !tokenDoc.isRevoked) {
        await tokenDoc.revoke(ipAddress, 'User logout');
      }
    }

    // Clear cookies
    res.clearCookie(COOKIE_NAMES.ACCESS_TOKEN);
    res.clearCookie(COOKIE_NAMES.REFRESH_TOKEN);

    // Log logout
    await logActivity({
      level: 'info',
      message: 'User logged out',
      module: 'authController',
      user: req.user?._id,
      req
    });

    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    logger.error('Logout error', { error: error.message, stack: error.stack });
    res.status(500).json({ message: error.message });
  }
};

// Logout from all devices - Revoke all refresh tokens
exports.logoutAll = async (req, res) => {
  try {
    const ipAddress = req.ip || req.connection.remoteAddress;

    // SECURITY: Revoke ALL access tokens (user-level invalidation)
    // This sets tokenValidAfter timestamp, invalidating all tokens issued before now
    await RevokedToken.revokeAllForUser(
      req.user._id,
      'logout_all_devices',
      ipAddress
    );

    // Revoke all refresh tokens for this user
    await RefreshToken.revokeAllForUser(
      req.user._id,
      ipAddress,
      'Logout from all devices'
    );

    // Clear cookies
    res.clearCookie(COOKIE_NAMES.ACCESS_TOKEN);
    res.clearCookie(COOKIE_NAMES.REFRESH_TOKEN);

    // Log logout from all devices
    await logActivity({
      level: 'info',
      message: 'User logged out from all devices - all tokens revoked',
      module: 'authController',
      user: req.user._id,
      metadata: { ipAddress, tokensRevoked: true },
      req
    });

    res.json({
      message: 'Logged out from all devices successfully',
      tokensRevoked: true
    });
  } catch (error) {
    logger.error('Logout all error', { error: error.message, stack: error.stack });
    res.status(500).json({ message: error.message });
  }
};

// Admin Only: Unlock User Account
exports.unlockAccount = async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ message: 'User ID is required' });
    }

    // Unlock the account
    const user = await User.unlockAccount(userId);

    // Log unlock action
    await logActivity({
      level: 'info',
      message: `Account unlocked by admin: "${user.name} | ${user._id}"`,
      module: 'authController',
      user: req.user._id,
      metadata: {
        unlockedUser: `${user.name} | ${user._id}`,
        unlockedEmail: user.email,
        adminUser: `${req.user.name} | ${req.user._id}`
      },
      req
    });

    res.json({
      message: 'Account unlocked successfully',
      user: {
        _id: user._id,
        name: user.name,
        email: user.email
      }
    });
  } catch (error) {
    logger.error('Unlock account error', { error: error.message, stack: error.stack });
    res.status(500).json({ message: error.message });
  }
};
