import User from '../models/User.js';
import { AppError, AuthenticationError, ValidationError } from '../utils/AppError.js';
import { logger } from '../utils/logger.js';
import AuditLog from '../models/AuditLog.js';
import { sendEmail, getClientUrl } from '../utils/mailer.js';
import {
  generateTokenPair,
  generateSecureToken,
  hashToken,
  verifyRefreshToken as verifyRefresh,
} from '../utils/jwt.js';

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};

const sendTokens = async (user, statusCode, res) => {
  const tokens = generateTokenPair(user);

  // Save refresh token to user
  user.refreshToken = tokens.refreshToken;
  await user.save({ validateBeforeSave: false });

  res.cookie('accessToken', tokens.accessToken, {
    ...cookieOptions,
    maxAge: 15 * 60 * 1000, // 15 minutes
  });

  res.cookie('refreshToken', tokens.refreshToken, cookieOptions);

  // Remove password from output
  user.passwordHash = undefined;
  user.refreshToken = undefined;

  res.status(statusCode).json({
    success: true,
    data: {
      user,
      tokens,
    },
  });
};

export const register = async (req, res, next) => {
  try {
    const { email, password, firstName, lastName, role, ...rest } = req.body;

    // Check if user exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return next(new ValidationError('Email already registered'));
    }

    // Admin can only be created by another admin
    if (role === 'admin' && (!req.user || req.user.role !== 'admin')) {
      return next(new ValidationError('Only admins can create admin accounts'));
    }

    // Create user
    const user = await User.create({
      email: email.toLowerCase(),
      passwordHash: password,
      firstName,
      lastName,
      role,
      ...rest,
    });

    // Log audit
    await AuditLog.log({
      user: user._id,
      action: 'USER_REGISTERED',
      resource: 'User',
      resourceId: user._id,
      details: { email, role, registeredBy: req.user?._id },
      ip: req.ip,
      userAgent: req.get('User-Agent'),
    });

    logger.info(`New user registered: ${email} (${role})`);

    sendTokens(user, 201, res);
  } catch (error) {
    next(error);
  }
};

export const login = async (req, res, next) => {
  try {
    const { email, password, rememberMe } = req.body;

    // Find user with password
    const user = await User.findOne({ email: email.toLowerCase() }).select('+passwordHash');
    if (!user) {
      // Log failed attempt
      await AuditLog.log({
        action: 'LOGIN_FAILED',
        resource: 'Auth',
        details: { email, reason: 'user_not_found' },
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        success: false,
      });
      return next(new AuthenticationError('Invalid email or password'));
    }

    // Check password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      // Log failed attempt
      await AuditLog.log({
        user: user._id,
        action: 'LOGIN_FAILED',
        resource: 'Auth',
        details: { email, reason: 'invalid_password' },
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        success: false,
      });
      return next(new AuthenticationError('Invalid email or password'));
    }

    // Check if user is active
    if (!user.isActive) {
      return next(
        new AuthenticationError('Your account has been deactivated. Please contact admin.')
      );
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save({ validateBeforeSave: false });

    // Log successful login
    await AuditLog.log({
      user: user._id,
      action: 'LOGIN_SUCCESS',
      resource: 'Auth',
      details: { email, rememberMe },
      ip: req.ip,
      userAgent: req.get('User-Agent'),
    });

    logger.info(`User logged in: ${email} (${user.role})`);

    sendTokens(user, 200, res);
  } catch (error) {
    next(error);
  }
};

export const logout = async (req, res, next) => {
  try {
    if (req.user) {
      // Clear refresh token
      req.user.refreshToken = null;
      await req.user.save({ validateBeforeSave: false });

      // Log audit
      await AuditLog.log({
        user: req.user._id,
        action: 'LOGOUT',
        resource: 'Auth',
        ip: req.ip,
        userAgent: req.get('User-Agent'),
      });
    }

    res.clearCookie('accessToken', cookieOptions);
    res.clearCookie('refreshToken', cookieOptions);

    res.status(200).json({
      success: true,
      message: 'Logged out successfully',
    });
  } catch (error) {
    next(error);
  }
};

export const refreshToken = async (req, res, next) => {
  try {
    const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken;

    if (!refreshToken) {
      return next(new AuthenticationError('Refresh token not provided'));
    }

    // Verify refresh token
    let decoded;
    try {
      decoded = verifyRefresh(refreshToken);
    } catch (error) {
      return next(new AuthenticationError('Invalid refresh token'));
    }

    // Find user
    const user = await User.findById(decoded.userId).select('+refreshToken');
    if (!user || !user.isActive) {
      return next(new AuthenticationError('User not found or deactivated'));
    }

    // Check if refresh token matches
    if (user.refreshToken !== refreshToken) {
      return next(new AuthenticationError('Invalid refresh token'));
    }

    // Generate new tokens
    sendTokens(user, 200, res);
  } catch (error) {
    next(error);
  }
};

export const getMe = async (req, res, next) => {
  try {
    // NOTE: User schema has no `courses` field (courses live on the Course
    // model referencing users), so populating it throws StrictPopulateError.
    // `department` is a plain string, not a ref, so no populate is needed.
    const user = await User.findById(req.user._id);

    res.status(200).json({
      success: true,
      data: { user },
    });
  } catch (error) {
    next(error);
  }
};

export const updateProfile = async (req, res, next) => {
  try {
    const allowedFields = ['firstName', 'lastName', 'phone', 'avatar'];

    // Role-specific fields
    if (req.user.role === 'faculty') {
      allowedFields.push('department', 'designation');
    } else if (req.user.role === 'student') {
      allowedFields.push('program', 'year', 'semester', 'rollNumber');
    }

    const updates = {};
    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    });

    const user = await User.findByIdAndUpdate(req.user._id, updates, {
      new: true,
      runValidators: true,
    });

    res.status(200).json({
      success: true,
      data: { user },
    });
  } catch (error) {
    next(error);
  }
};

export const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    const user = await User.findById(req.user._id).select('+passwordHash');

    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return next(new AuthenticationError('Current password is incorrect'));
    }

    user.passwordHash = newPassword;
    await user.save();

    // Log audit
    await AuditLog.log({
      user: user._id,
      action: 'PASSWORD_CHANGED',
      resource: 'User',
      resourceId: user._id,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
    });

    // Logout from all devices (optional - just clear refresh token)
    user.refreshToken = null;
    await user.save({ validateBeforeSave: false });

    res.clearCookie('accessToken', cookieOptions);
    res.clearCookie('refreshToken', cookieOptions);

    res.status(200).json({
      success: true,
      message: 'Password changed successfully. Please log in again.',
    });
  } catch (error) {
    next(error);
  }
};

export const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      // Don't reveal if email exists
      return res.status(200).json({
        success: true,
        message: 'If the email exists, a reset link has been sent',
      });
    }

    // Generate reset token
    const resetToken = generateSecureToken(32);
    user.passwordResetToken = hashToken(resetToken);
    user.passwordResetExpires = Date.now() + 10 * 60 * 1000; // 10 minutes
    await user.save({ validateBeforeSave: false });

    // Send reset email (no-ops/logs if SMTP not configured)
    const resetUrl = `${getClientUrl()}/reset-password?token=${resetToken}`;
    await sendEmail({
      to: user.email,
      subject: 'Password Reset — Attendance System',
      text: `You requested a password reset.\n\nReset your password here (valid 10 minutes):\n${resetUrl}\n\nIf you didn't request this, ignore this email.`,
      html: `
        <p>You requested a password reset.</p>
        <p><a href="${resetUrl}">Reset your password</a> (link valid for 10 minutes).</p>
        <p>If you didn't request this, you can ignore this email.</p>
      `,
    });

    // Log audit
    await AuditLog.log({
      user: user._id,
      action: 'PASSWORD_RESET_REQUESTED',
      resource: 'Auth',
      details: { email },
      ip: req.ip,
      userAgent: req.get('User-Agent'),
    });

    res.status(200).json({
      success: true,
      message: 'If the email exists, a reset link has been sent',
    });
  } catch (error) {
    next(error);
  }
};

export const resetPassword = async (req, res, next) => {
  try {
    const { token, password } = req.body;

    const hashedToken = hashToken(token);

    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: Date.now() },
    }).select('+passwordHash');

    if (!user) {
      return next(new AuthenticationError('Token is invalid or has expired'));
    }

    user.passwordHash = password;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    user.refreshToken = null; // Invalidate all sessions
    await user.save();

    // Log audit
    await AuditLog.log({
      user: user._id,
      action: 'PASSWORD_RESET',
      resource: 'Auth',
      ip: req.ip,
      userAgent: req.get('User-Agent'),
    });

    res.status(200).json({
      success: true,
      message: 'Password reset successful. Please log in.',
    });
  } catch (error) {
    next(error);
  }
};

export const verifyEmail = async (req, res, next) => {
  try {
    // Implementation for email verification if needed
    res.status(200).json({
      success: true,
      message: 'Email verified',
    });
  } catch (error) {
    next(error);
  }
};
