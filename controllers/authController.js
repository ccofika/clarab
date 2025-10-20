const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const RefreshToken = require('../models/RefreshToken');
const LoginAttempt = require('../models/LoginAttempt');
const { createDefaultQuickLinks } = require('../utils/createDefaultQuickLinks');
const { logActivity } = require('../utils/activityLogger');

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

      // Set JWT access token cookie (15 minutes)
      const accessCookieOptions = {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 15 * 60 * 1000 // 15 minutes
      };
      res.cookie('jwt', accessToken, accessCookieOptions);

      // Set refresh token cookie (7 days)
      const refreshCookieOptions = {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
      };
      res.cookie('refreshToken', refreshToken, refreshCookieOptions);

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

// Login User
exports.login = async (req, res) => {
  try {
    console.log('🔐 Login attempt:', { email: req.body.email });
    const { email, password } = req.body;
    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.get('user-agent') || '';

    // Check user exists
    const user = await User.findOne({ email });
    if (!user) {
      console.log('❌ User not found:', email);

      // Log failed attempt to database
      await LoginAttempt.logAttempt(email, ipAddress, false, 'user_not_found', userAgent);

      // Log to activity log
      await logActivity({
        level: 'warn',
        message: 'Failed login attempt - user not found',
        module: 'authController',
        metadata: { email, ipAddress },
        req
      });

      return res.status(401).json({ message: 'Invalid credentials' });
    }

    console.log('✅ User found:', { email: user.email, role: user.role });

    // Check if account is locked
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

      console.log('🔒 Account locked for:', email);
      return res.status(423).json({
        message: `Account is temporarily locked due to multiple failed login attempts. Please try again in ${lockTimeRemaining} minutes.`,
        locked: true,
        lockTimeRemaining
      });
    }

    // Check password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      console.log('❌ Password mismatch for:', email);

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

        console.log('🔒 Account now locked for:', email);
        return res.status(423).json({
          message: `Account has been locked due to multiple failed login attempts. Please try again in ${lockTimeRemaining} minutes.`,
          locked: true,
          lockTimeRemaining
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

      return res.status(401).json({
        message: 'Invalid credentials',
        attemptsLeft: attemptsLeft > 0 ? attemptsLeft : undefined
      });
    }

    console.log('✅ Password match for:', email);

    // Reset login attempts on successful login
    if (user.loginAttempts > 0 || user.lockUntil) {
      await user.resetLoginAttempts();
    }

    // Log successful attempt to database
    await LoginAttempt.logAttempt(email, ipAddress, true, null, userAgent);

    // Generate access token and refresh token
    const accessToken = generateAccessToken(user._id);
    const refreshToken = await generateAndStoreRefreshToken(user._id, req);

    // Set JWT access token cookie (15 minutes)
    const accessCookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 15 * 60 * 1000 // 15 minutes
    };
    res.cookie('jwt', accessToken, accessCookieOptions);

    // Set refresh token cookie (7 days)
    const refreshCookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    };
    res.cookie('refreshToken', refreshToken, refreshCookieOptions);

    console.log('✅ Login successful for:', email);

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

    res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      token: accessToken
    });
  } catch (error) {
    console.error('❌ Login error:', error);
    res.status(500).json({ message: error.message });
  }
};

// Get User Profile
exports.getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Google OAuth Callback
// SECURITY: Token sent via HTTP-only cookie instead of URL to prevent token exposure
exports.googleCallback = async (req, res) => {
  try {
    const user = req.user;

    // Generate access token and refresh token
    const accessToken = generateAccessToken(user._id);
    const refreshToken = await generateAndStoreRefreshToken(user._id, req);

    // Set JWT access token cookie (15 minutes)
    const accessCookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 15 * 60 * 1000 // 15 minutes
    };
    res.cookie('jwt', accessToken, accessCookieOptions);

    // Set refresh token cookie (7 days)
    const refreshCookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    };
    res.cookie('refreshToken', refreshToken, refreshCookieOptions);

    // Redirect to frontend with only non-sensitive data
    const frontendURL = process.env.FRONTEND_URL || 'http://localhost:3000';
    res.redirect(`${frontendURL}/auth/callback?isFirstLogin=${user.isFirstLogin}&userId=${user._id}&success=true`);
  } catch (error) {
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

    // Set JWT access token cookie (15 minutes)
    const accessCookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 15 * 60 * 1000 // 15 minutes
    };
    res.cookie('jwt', accessToken, accessCookieOptions);

    // Set refresh token cookie (7 days)
    const refreshCookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    };
    res.cookie('refreshToken', refreshToken, refreshCookieOptions);

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

    res.json({ message: 'Password changed successfully' });
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

// Refresh Access Token using Refresh Token
exports.refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.cookies;

    if (!refreshToken) {
      return res.status(401).json({ message: 'Refresh token not found' });
    }

    // Find refresh token in database
    const tokenDoc = await RefreshToken.findOne({ token: refreshToken });

    if (!tokenDoc) {
      return res.status(401).json({ message: 'Invalid refresh token' });
    }

    // Check if token is revoked
    if (tokenDoc.isRevoked) {
      return res.status(401).json({ message: 'Refresh token has been revoked' });
    }

    // Check if token is expired
    if (tokenDoc.isExpired) {
      return res.status(401).json({ message: 'Refresh token has expired' });
    }

    // Generate new access token
    const accessToken = generateAccessToken(tokenDoc.user);

    // Set new JWT access token cookie (15 minutes)
    const accessCookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 15 * 60 * 1000 // 15 minutes
    };
    res.cookie('jwt', accessToken, accessCookieOptions);

    // Log token refresh
    await logActivity({
      level: 'info',
      message: 'Access token refreshed',
      module: 'authController',
      user: tokenDoc.user,
      metadata: { deviceType: tokenDoc.deviceInfo.deviceType },
      req
    });

    res.json({
      token: accessToken,
      message: 'Token refreshed successfully'
    });
  } catch (error) {
    console.error('❌ Refresh token error:', error);
    res.status(500).json({ message: error.message });
  }
};

// Logout - Revoke current refresh token
exports.logout = async (req, res) => {
  try {
    const { refreshToken } = req.cookies;

    if (refreshToken) {
      const tokenDoc = await RefreshToken.findOne({ token: refreshToken });
      if (tokenDoc && !tokenDoc.isRevoked) {
        const ipAddress = req.ip || req.connection.remoteAddress;
        await tokenDoc.revoke(ipAddress, 'User logout');
      }
    }

    // Clear cookies
    res.clearCookie('jwt');
    res.clearCookie('refreshToken');

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
    console.error('❌ Logout error:', error);
    res.status(500).json({ message: error.message });
  }
};

// Logout from all devices - Revoke all refresh tokens
exports.logoutAll = async (req, res) => {
  try {
    const ipAddress = req.ip || req.connection.remoteAddress;

    // Revoke all refresh tokens for this user
    await RefreshToken.revokeAllForUser(
      req.user._id,
      ipAddress,
      'Logout from all devices'
    );

    // Clear cookies
    res.clearCookie('jwt');
    res.clearCookie('refreshToken');

    // Log logout from all devices
    await logActivity({
      level: 'info',
      message: 'User logged out from all devices',
      module: 'authController',
      user: req.user._id,
      req
    });

    res.json({ message: 'Logged out from all devices successfully' });
  } catch (error) {
    console.error('❌ Logout all error:', error);
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
    console.error('❌ Unlock account error:', error);
    res.status(500).json({ message: error.message });
  }
};
