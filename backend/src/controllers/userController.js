import User from '../models/User.js';
import { AppError, NotFoundError, ValidationError } from '../utils/AppError.js';
import { logger } from '../utils/logger.js';
import AuditLog from '../models/AuditLog.js';

export const getUsers = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 20,
      search,
      role,
      department,
      isActive,
      sort = '-createdAt',
    } = req.query;

    const query = {};
    if (search) {
      query.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { studentId: { $regex: search, $options: 'i' } },
        { employeeId: { $regex: search, $options: 'i' } },
      ];
    }
    if (role) query.role = role;
    if (department) query.department = department;
    if (isActive !== undefined) query.isActive = isActive === 'true';

    const skip = (page - 1) * limit;

    const [users, total] = await Promise.all([
      User.find(query)
        .select('-passwordHash -refreshToken -passwordResetToken -passwordResetExpires')
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit)),
      User.countDocuments(query),
    ]);

    res.status(200).json({
      success: true,
      data: { users },
      meta: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getUser = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id).select(
      '-passwordHash -refreshToken -passwordResetToken -passwordResetExpires'
    );
    if (!user) {
      return next(new NotFoundError('User'));
    }

    res.status(200).json({
      success: true,
      data: { user },
    });
  } catch (error) {
    next(error);
  }
};

export const createUser = async (req, res, next) => {
  try {
    const { email, password, firstName, lastName, role, ...rest } = req.body;

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      return next(new ValidationError('Email already registered'));
    }

    const user = await User.create({
      email: email.toLowerCase(),
      passwordHash: password,
      firstName,
      lastName,
      role,
      ...rest,
    });

    await AuditLog.log({
      user: req.user._id,
      action: 'USER_CREATED',
      resource: 'User',
      resourceId: user._id,
      details: { email, role, createdBy: req.user._id },
      ip: req.ip,
      userAgent: req.get('User-Agent'),
    });

    user.passwordHash = undefined;

    // Notify admins so their user list refreshes without a manual reload.
    req.io?.to('role:admin').emit('user:created', { userId: user._id });

    res.status(201).json({
      success: true,
      data: { user },
    });
  } catch (error) {
    next(error);
  }
};

export const updateUser = async (req, res, next) => {
  try {
    const allowedFields = [
      'firstName',
      'lastName',
      'email',
      'phone',
      'role',
      'isActive',
      'department',
      'designation',
      'program',
      'year',
      'semester',
      'rollNumber',
    ];

    const updates = {};
    Object.keys(req.body).forEach((key) => {
      if (allowedFields.includes(key)) {
        updates[key] = req.body[key];
      }
    });

    const user = await User.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    }).select('-passwordHash -refreshToken');

    if (!user) {
      return next(new NotFoundError('User'));
    }

    await AuditLog.log({
      user: req.user._id,
      action: 'USER_UPDATED',
      resource: 'User',
      resourceId: user._id,
      details: { updatedFields: Object.keys(updates), updatedBy: req.user._id },
      ip: req.ip,
      userAgent: req.get('User-Agent'),
    });

    res.status(200).json({
      success: true,
      data: { user },
    });
  } catch (error) {
    next(error);
  }
};

export const deactivateUser = async (req, res, next) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    ).select('-passwordHash -refreshToken');

    if (!user) {
      return next(new NotFoundError('User'));
    }

    user.refreshToken = undefined;
    await user.save({ validateBeforeSave: false });

    await AuditLog.log({
      user: req.user._id,
      action: 'USER_DEACTIVATED',
      resource: 'User',
      resourceId: user._id,
      details: { deactivatedBy: req.user._id },
      ip: req.ip,
      userAgent: req.get('User-Agent'),
    });

    res.status(200).json({
      success: true,
      message: 'User deactivated successfully',
    });
  } catch (error) {
    next(error);
  }
};

export const getFaculty = async (req, res, next) => {
  try {
    const faculty = await User.find({ role: 'faculty', isActive: true })
      .select('firstName lastName email employeeId department designation avatar')
      .sort({ lastName: 1, firstName: 1 });

    res.status(200).json({
      success: true,
      data: { faculty },
    });
  } catch (error) {
    next(error);
  }
};

export const getStudents = async (req, res, next) => {
  try {
    const { page = 1, limit = 50, search, program, year, semester, department } = req.query;

    const query = { role: 'student', isActive: true };
    if (search) {
      query.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { studentId: { $regex: search, $options: 'i' } },
      ];
    }
    if (program) query.program = program;
    if (year) query.year = parseInt(year);
    if (semester) query.semester = parseInt(semester);
    if (department) query.department = department;

    const skip = (page - 1) * limit;

    const [students, total] = await Promise.all([
      User.find(query)
        .select('firstName lastName email studentId program year semester rollNumber avatar')
        .sort({ lastName: 1, firstName: 1 })
        .skip(skip)
        .limit(parseInt(limit)),
      User.countDocuments(query),
    ]);

    res.status(200).json({
      success: true,
      data: { students },
      meta: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getUserAttendance = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { courseId } = req.query;

    const Attendance = (await import('../models/Attendance.js')).default;

    const stats = await Attendance.getStudentStats(id, { courseId });

    res.status(200).json({
      success: true,
      data: { stats },
    });
  } catch (error) {
    next(error);
  }
};
