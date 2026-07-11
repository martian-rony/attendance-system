import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { AppError, AuthenticationError, AuthorizationError } from '../utils/AppError.js';
import { logger } from '../utils/logger.js';

export const protect = async (req, res, next) => {
  try {
    // 1) Get token from header
    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    } else if (req.cookies?.accessToken) {
      token = req.cookies.accessToken;
    }

    if (!token) {
      return next(new AuthenticationError('You are not logged in. Please log in to get access.'));
    }

    // 2) Verify token
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        return next(new AuthenticationError('Your session has expired. Please log in again.'));
      }
      return next(new AuthenticationError('Invalid token. Please log in again.'));
    }

    // 3) Check if user still exists
    const currentUser = await User.findById(decoded.userId).select('+passwordHash');
    if (!currentUser) {
      return next(new AuthenticationError('The user belonging to this token no longer exists.'));
    }

    // 4) Check if user is active
    if (!currentUser.isActive) {
      return next(
        new AuthenticationError('Your account has been deactivated. Please contact admin.')
      );
    }

    // 5) Check if password was changed after token was issued
    if (currentUser.changedPasswordAfter && currentUser.changedPasswordAfter(decoded.iat)) {
      return next(new AuthenticationError('User recently changed password! Please log in again.'));
    }

    // Grant access to protected route
    req.user = currentUser;
    next();
  } catch (error) {
    next(error);
  }
};

export const restrictTo = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AuthenticationError('You are not logged in'));
    }

    if (!roles.includes(req.user.role)) {
      return next(new AuthorizationError('You do not have permission to perform this action'));
    }
    next();
  };
};

// Optional authentication - doesn't fail if no token
export const optionalAuth = async (req, res, next) => {
  try {
    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    } else if (req.cookies?.accessToken) {
      token = req.cookies.accessToken;
    }

    if (!token) {
      return next();
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const currentUser = await User.findById(decoded.userId);

    if (currentUser && currentUser.isActive) {
      req.user = currentUser;
    }
    next();
  } catch (error) {
    // Ignore token errors, continue without user
    next();
  }
};

// Check if user owns resource or is admin
export const checkOwnership = (model, userField = 'user') => {
  return async (req, res, next) => {
    try {
      const doc = await model.findById(req.params.id || req.params.resourceId);
      if (!doc) {
        return next(new AppError('Document not found', 404));
      }

      const ownerId = doc[userField]?.toString() || doc._id.toString();
      if (ownerId !== req.user._id.toString() && req.user.role !== 'admin') {
        return next(new AuthorizationError('You do not have permission to access this resource'));
      }

      req.resource = doc;
      next();
    } catch (error) {
      next(error);
    }
  };
};

// Faculty can only access their own courses
export const restrictToOwnCourse = async (req, res, next) => {
  if (!req.user) {
    return next(new AuthenticationError('You are not logged in'));
  }

  if (req.user.role === 'admin') {
    return next();
  }

  if (req.user.role === 'faculty') {
    const Course = (await import('../models/Course.js')).default;
    const courseId = req.params.courseId || req.params.id || req.body.course;

    if (courseId) {
      const course = await Course.findById(courseId);
      if (!course) {
        return next(new AppError('Course not found', 404));
      }
      if (course.faculty.toString() !== req.user._id.toString()) {
        return next(new AuthorizationError('You can only access your own courses'));
      }
    }
  }

  next();
};

// Student can only access their enrolled courses
export const restrictToEnrolledCourse = async (req, res, next) => {
  if (!req.user) {
    return next(new AuthenticationError('You are not logged in'));
  }

  if (['admin', 'faculty'].includes(req.user.role)) {
    return next();
  }

  if (req.user.role === 'student') {
    const Enrollment = (await import('../models/Enrollment.js')).default;
    const courseId = req.params.courseId || req.params.id || req.body.course;

    if (courseId) {
      const enrollment = await Enrollment.findOne({
        student: req.user._id,
        course: courseId,
        status: 'active',
      });

      if (!enrollment) {
        return next(new AuthorizationError('You are not enrolled in this course'));
      }
    }
  }

  next();
};

export const verifyRefreshToken = async (req, res, next) => {
  try {
    const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken;

    if (!refreshToken) {
      return next(new AuthenticationError('Refresh token not provided'));
    }

    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    const user = await User.findById(decoded.userId).select('+refreshToken');

    if (!user || !user.isActive) {
      return next(new AuthenticationError('User not found or deactivated'));
    }

    if (user.refreshToken !== refreshToken) {
      return next(new AuthenticationError('Invalid refresh token'));
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return next(new AuthenticationError('Refresh token expired. Please log in again.'));
    }
    return next(new AuthenticationError('Invalid refresh token'));
  }
};
