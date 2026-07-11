import Session from '../models/Session.js';
import Course from '../models/Course.js';
import Attendance from '../models/Attendance.js';
import Enrollment from '../models/Enrollment.js';
import User from '../models/User.js';
import QRCode from 'qrcode';
import { AppError, NotFoundError, AuthorizationError } from '../utils/AppError.js';
import { logger } from '../utils/logger.js';
import AuditLog from '../models/AuditLog.js';
import crypto from 'crypto';

export const createSession = async (req, res, next) => {
  try {
    const {
      courseId,
      title,
      description,
      date,
      startTime,
      endTime,
      room,
      settings,
      location,
      geofenceRadius,
    } = req.body;

    const course = await Course.findById(courseId);
    if (!course) {
      return next(new NotFoundError('Course'));
    }

    // Check authorization
    if (req.user.role === 'faculty' && course.faculty.toString() !== req.user._id.toString()) {
      return next(new AuthorizationError('You can only create sessions for your own courses'));
    }

    const session = await Session.create({
      course: courseId,
      faculty: req.user._id,
      title,
      description,
      date: new Date(date),
      startTime,
      endTime,
      room,
      settings: {
        allowLateEntry: settings?.allowLateEntry ?? course.settings.allowLateEntry,
        lateThreshold: settings?.lateThreshold ?? course.settings.lateThreshold,
        requireGeolocation: settings?.requireGeolocation ?? course.settings.requireGeolocation,
      },
      attendanceWindow: {
        openBefore:
          settings?.attendanceWindow?.openBefore ??
          course.settings.attendanceWindow?.openBefore ??
          10,
        closeAfter:
          settings?.attendanceWindow?.closeAfter ??
          course.settings.attendanceWindow?.closeAfter ??
          30,
      },
      location: location || course.location,
      geofenceRadius: geofenceRadius || course.geofenceRadius,
    });

    // Generate QR code
    await session.generateQRCode();

    // Populate for response
    await session.populate('course', 'code name');

    // Log audit
    await AuditLog.log({
      user: req.user._id,
      action: 'SESSION_CREATED',
      resource: 'Session',
      resourceId: session._id,
      details: { courseId, title, date, startTime, endTime },
      ip: req.ip,
      userAgent: req.get('User-Agent'),
    });

    logger.info(`Session created: ${session.title} for ${course.code}`);

    // Notify admins so their session list refreshes without a manual reload.
    req.io?.to('role:admin').emit('session:created', {
      sessionId: session._id,
      courseId: session.course,
    });

    res.status(201).json({
      success: true,
      data: { session },
    });
  } catch (error) {
    next(error);
  }
};

export const getSessions = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, courseId, status, dateFrom, dateTo, sort = '-date' } = req.query;

    const query = {};

    // Role-based filtering
    if (req.user.role === 'faculty') {
      query.faculty = req.user._id;
    } else if (req.user.role === 'student') {
      // Get courses student is enrolled in
      const enrollments = await Enrollment.find({ student: req.user._id, status: 'active' }).select(
        'course'
      );
      const courseIds = enrollments.map((e) => e.course);
      query.course = { $in: courseIds };
    }

    if (courseId) query.course = courseId;
    if (status) query.status = status;
    if (dateFrom || dateTo) {
      query.date = {};
      if (dateFrom) query.date.$gte = new Date(dateFrom);
      if (dateTo) query.date.$lte = new Date(dateTo);
    }

    const skip = (page - 1) * limit;

    const [sessions, total] = await Promise.all([
      Session.find(query)
        .populate('course', 'code name department')
        .populate('faculty', 'firstName lastName')
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit)),
      Session.countDocuments(query),
    ]);

    res.status(200).json({
      success: true,
      data: { sessions },
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

export const getSession = async (req, res, next) => {
  try {
    const session = await Session.findById(req.params.id)
      .populate('course', 'code name department faculty settings')
      .populate('faculty', 'firstName lastName email employeeId');

    if (!session) {
      return next(new NotFoundError('Session'));
    }

    // Check authorization
    if (req.user.role === 'faculty' && session.faculty._id.toString() !== req.user._id.toString()) {
      return next(new AuthorizationError('Access denied'));
    }

    if (req.user.role === 'student') {
      const enrollment = await Enrollment.findOne({
        student: req.user._id,
        course: session.course._id,
        status: 'active',
      });
      if (!enrollment) {
        return next(new AuthorizationError('You are not enrolled in this course'));
      }
    }

    // If session is active, include QR code
    let qrCodeImage = null;
    if (session.status === 'active' && session.qrCode?.isActive) {
      qrCodeImage = await QRCode.toDataURL(session.qrCode.data, {
        width: 300,
        margin: 2,
      });
    }

    res.status(200).json({
      success: true,
      data: {
        session: {
          ...session.toObject(),
          qrCodeImage,
          isWithinWindow: session.isWithinWindow,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

export const updateSession = async (req, res, next) => {
  try {
    const session = await Session.findById(req.params.id);
    if (!session) {
      return next(new NotFoundError('Session'));
    }

    if (req.user.role === 'faculty' && session.faculty.toString() !== req.user._id.toString()) {
      return next(new AuthorizationError('You can only update your own sessions'));
    }

    if (session.status === 'completed') {
      return next(new AppError('Cannot update completed session', 400));
    }

    const allowedUpdates = [
      'title',
      'description',
      'room',
      'settings',
      'date',
      'startTime',
      'endTime',
    ];
    const updates = {};
    allowedUpdates.forEach((field) => {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    });

    const updatedSession = await Session.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    }).populate('course', 'code name');

    // Regenerate QR code if date/time changed
    if (req.body.date || req.body.startTime || req.body.endTime) {
      await updatedSession.generateQRCode();
    }

    // Log audit
    await AuditLog.log({
      user: req.user._id,
      action: 'SESSION_UPDATED',
      resource: 'Session',
      resourceId: session._id,
      details: { updatedFields: Object.keys(updates) },
      ip: req.ip,
      userAgent: req.get('User-Agent'),
    });

    res.status(200).json({
      success: true,
      data: { session: updatedSession },
    });
  } catch (error) {
    next(error);
  }
};

export const deleteSession = async (req, res, next) => {
  try {
    const session = await Session.findById(req.params.id);
    if (!session) {
      return next(new NotFoundError('Session'));
    }

    if (req.user.role === 'faculty' && session.faculty.toString() !== req.user._id.toString()) {
      return next(new AuthorizationError('You can only delete your own sessions'));
    }

    if (session.status === 'completed') {
      return next(new AppError('Cannot delete completed session', 400));
    }

    const reason = req.body.reason || 'Deleted by faculty';
    await session.cancelSession(reason);

    // Log audit
    await AuditLog.log({
      user: req.user._id,
      action: 'SESSION_CANCELLED',
      resource: 'Session',
      resourceId: session._id,
      details: { reason },
      ip: req.ip,
      userAgent: req.get('User-Agent'),
    });

    res.status(200).json({
      success: true,
      message: 'Session cancelled',
    });
  } catch (error) {
    next(error);
  }
};

export const startSession = async (req, res, next) => {
  try {
    const session = await Session.findById(req.params.id);
    if (!session) {
      return next(new NotFoundError('Session'));
    }

    if (req.user.role === 'faculty' && session.faculty.toString() !== req.user._id.toString()) {
      return next(new AuthorizationError('Access denied'));
    }

    if (session.status !== 'scheduled') {
      return next(new AppError(`Cannot start session with status: ${session.status}`, 400));
    }

    await session.startSession();

    // Get enrolled students count
    const enrolledCount = await Enrollment.countDocuments({
      course: session.course,
      status: 'active',
    });

    session.metadata.totalStudents = enrolledCount;
    await session.save();

    // Log audit
    await AuditLog.log({
      user: req.user._id,
      action: 'SESSION_STARTED',
      resource: 'Session',
      resourceId: session._id,
      details: { enrolledCount },
      ip: req.ip,
      userAgent: req.get('User-Agent'),
    });

    // Emit real-time event
    req.io?.to(`course:${session.course}`).emit('session:started', {
      sessionId: session._id,
      courseId: session.course,
      qrCode: session.qrCode.data,
      expiresAt: session.qrCode.expiresAt,
    });
    // Also notify admins so their session list refreshes on start.
    req.io?.to('role:admin').emit('session:started', {
      sessionId: session._id,
      courseId: session.course,
    });

    // Generate QR code image
    const qrCodeImage = await QRCode.toDataURL(session.qrCode.data, {
      width: 400,
      margin: 2,
    });

    res.status(200).json({
      success: true,
      data: {
        session,
        qrCode: session.qrCode,
        qrCodeImage,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const endSession = async (req, res, next) => {
  try {
    const session = await Session.findById(req.params.id);
    if (!session) {
      return next(new NotFoundError('Session'));
    }

    if (req.user.role === 'faculty' && session.faculty.toString() !== req.user._id.toString()) {
      return next(new AuthorizationError('Access denied'));
    }

    if (session.status !== 'active') {
      return next(new AppError(`Cannot end session with status: ${session.status}`, 400));
    }

    await session.endSession();

    // Update metadata with final stats
    const stats = await Attendance.aggregate([
      { $match: { session: session._id } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
        },
      },
    ]);

    const metadata = { presentCount: 0, absentCount: 0, lateCount: 0 };
    stats.forEach((s) => {
      if (s._id === 'present') metadata.presentCount = s.count;
      else if (s._id === 'absent') metadata.absentCount = s.count;
      else if (s._id === 'late') metadata.lateCount = s.count;
    });

    await session.updateMetadata(metadata);

    // Log audit
    await AuditLog.log({
      user: req.user._id,
      action: 'SESSION_ENDED',
      resource: 'Session',
      resourceId: session._id,
      details: { ...metadata, totalStudents: session.metadata.totalStudents },
      ip: req.ip,
      userAgent: req.get('User-Agent'),
    });

    // Emit real-time event
    req.io?.to(`course:${session.course}`).emit('session:ended', {
      sessionId: session._id,
      stats: metadata,
    });

    res.status(200).json({
      success: true,
      data: { session },
    });
  } catch (error) {
    next(error);
  }
};

export const getSessionQR = async (req, res, next) => {
  try {
    const session = await Session.findById(req.params.id);
    if (!session) {
      return next(new NotFoundError('Session'));
    }

    if (req.user.role === 'faculty' && session.faculty.toString() !== req.user._id.toString()) {
      return next(new AuthorizationError('Access denied'));
    }

    if (session.status !== 'active') {
      return next(new AppError('QR code not available. Session must be active.', 400));
    }

    // Lazily (re)generate the QR if missing or expired — an active session
    // should always be scannable. Prevents "active session, no QR" states
    // that would otherwise 400 the student's scan flow.
    if (!session.qrCode?.isActive || new Date() > (session.qrCode?.expiresAt || 0)) {
      await session.generateQRCode();
    }

    // Generate QR code image
    const qrCodeImage = await QRCode.toDataURL(session.qrCode.data, {
      width: 400,
      margin: 2,
    });

    res.status(200).json({
      success: true,
      data: {
        qrCode: session.qrCode,
        qrCodeImage,
        windowOpenTime: session.windowOpenTime,
        windowCloseTime: session.windowCloseTime,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getSessionAttendance = async (req, res, next) => {
  try {
    const { page = 1, limit = 50, status, sort = 'student' } = req.query;
    const sessionId = req.params.id;

    const session = await Session.findById(sessionId).populate('course', 'code name');
    if (!session) {
      return next(new NotFoundError('Session'));
    }

    if (req.user.role === 'faculty' && session.faculty.toString() !== req.user._id.toString()) {
      return next(new AuthorizationError('Access denied'));
    }

    const query = { session: sessionId };
    if (status) query.status = status;

    const skip = (page - 1) * limit;

    const [attendance, total] = await Promise.all([
      Attendance.find(query)
        .populate('student', 'firstName lastName studentId email avatar')
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit)),
      Attendance.countDocuments(query),
    ]);

    res.status(200).json({
      success: true,
      data: {
        attendance,
        session: { _id: session._id, title: session.title, date: session.date },
      },
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

export const getActiveSessions = async (req, res, next) => {
  try {
    // Compare against local end-of-day so the active list is consistent with
    // sessionDateTime (which is computed in local time). A bare "YYYY-MM-DD"
    // date is stored as UTC midnight, so using UTC `new Date()` would drop
    // today's sessions in positive-offset zones like IST.
    const localEndOfDay = new Date();
    localEndOfDay.setHours(23, 59, 59, 999);
    const sessions = await Session.find({
      status: 'active',
      date: { $lte: localEndOfDay },
    })
      .populate('course', 'code name')
      .populate('faculty', 'firstName lastName')
      .sort({ startTime: 1 });

    res.status(200).json({
      success: true,
      data: { sessions },
    });
  } catch (error) {
    next(error);
  }
};

export const getUpcomingSessions = async (req, res, next) => {
  try {
    const { limit = 10 } = req.query;
    let sessions;

    if (req.user.role === 'faculty') {
      sessions = await Session.findUpcoming({ facultyId: req.user._id, limit: parseInt(limit) });
    } else if (req.user.role === 'student') {
      sessions = await Session.findUpcoming({ studentId: req.user._id, limit: parseInt(limit) });
    } else {
      sessions = await Session.findUpcoming({ limit: parseInt(limit) });
    }

    res.status(200).json({
      success: true,
      data: { sessions },
    });
  } catch (error) {
    next(error);
  }
};

export const getTodaysSessions = async (req, res, next) => {
  try {
    let sessions;

    if (req.user.role === 'faculty') {
      sessions = await Session.getTodaysSessions(req.user._id);
    } else if (req.user.role === 'student') {
      // Get sessions for courses student is enrolled in
      const enrollments = await Enrollment.find({ student: req.user._id, status: 'active' }).select(
        'course'
      );
      const courseIds = enrollments.map((e) => e.course);

      sessions = await Session.find({
        course: { $in: courseIds },
        date: {
          $gte: new Date(new Date().setHours(0, 0, 0, 0)),
          $lt: new Date(new Date().setHours(23, 59, 59, 999)),
        },
        status: { $in: ['scheduled', 'active'] },
      })
        .populate('course', 'code name')
        .populate('faculty', 'firstName lastName')
        .sort({ startTime: 1 });
    } else {
      sessions = await Session.getTodaysSessions();
    }

    res.status(200).json({
      success: true,
      data: { sessions },
    });
  } catch (error) {
    next(error);
  }
};
