import Attendance from '../models/Attendance.js';
import Session from '../models/Session.js';
import Course from '../models/Course.js';
import Enrollment from '../models/Enrollment.js';
import User from '../models/User.js';
import { AppError, NotFoundError, AuthorizationError, ValidationError } from '../utils/AppError.js';
import { logger } from '../utils/logger.js';
import AuditLog from '../models/AuditLog.js';
import crypto from 'crypto';
import { notify } from '../services/notificationService.js';

const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371e3; // Earth radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Distance in meters
};

export const markAttendance = async (req, res, next) => {
  try {
    const { sessionId, qrToken, geolocation, deviceInfo } = req.body;

    // Find session
    const session = await Session.findById(sessionId).populate(
      'course',
      'code name settings location geofenceRadius'
    );

    if (!session) {
      return next(new NotFoundError('Session'));
    }

    // Check session status
    if (session.status !== 'active') {
      return next(new AppError('Attendance can only be marked for active sessions', 400));
    }

    // Check if attendance window is open
    if (!session.isWithinWindow) {
      return next(new AppError('Attendance window is closed', 400));
    }

    // Verify QR token
    if (!qrToken) {
      return next(new ValidationError('QR token is required'));
    }

    const qrValidation = session.validateQRCode(qrToken);
    if (!qrValidation.valid) {
      return next(new ValidationError(qrValidation.reason));
    }

    // Anti-screenshot: if the session enforces rotating QR, require a valid
    // short-lived rotating token alongside the static QR token.
    if (session.settings?.rotatingQR) {
      const rt = req.body.rotatingToken;
      if (!session.validateRotatingToken(rt)) {
        return next(
          new ValidationError(
            'This QR code has expired. Scan the live code shown by your faculty (it refreshes every few seconds).'
          )
        );
      }
    }

    // Check if student is enrolled
    const enrollment = await Enrollment.findOne({
      student: req.user._id,
      course: session.course._id,
      status: 'active',
    });

    if (!enrollment) {
      return next(new AuthorizationError('You are not enrolled in this course'));
    }

    // Check if already marked
    const existingAttendance = await Attendance.findOne({
      session: sessionId,
      student: req.user._id,
    });

    if (existingAttendance) {
      return next(new ValidationError('Attendance already marked for this session'));
    }

    // Anti-proxy: detect the same physical device marking for a second student
    // in this session. Fingerprint = client-supplied fingerprint if present,
    // else a server-derived hash of userAgent + IP. Never blocks the first
    // marker; only a second, different student on the same device.
    const deviceFingerprint =
      deviceInfo?.fingerprint ||
      crypto
        .createHash('sha256')
        .update(`${req.get('User-Agent') || ''}|${req.ip || ''}`)
        .digest('hex')
        .substring(0, 32);

    if (session.settings?.blockDeviceReuse !== false) {
      const deviceAlreadyUsed = await Attendance.findOne({
        session: sessionId,
        'verification.deviceInfo.fingerprint': deviceFingerprint,
        student: { $ne: req.user._id },
      }).select('_id student');

      if (deviceAlreadyUsed) {
        // Audit the blocked attempt for faculty review.
        await AuditLog.log({
          user: req.user._id,
          action: 'ATTENDANCE_DEVICE_REUSE_BLOCKED',
          resource: 'Session',
          resourceId: sessionId,
          success: false,
          details: { deviceFingerprint, conflictingStudent: deviceAlreadyUsed.student },
          ip: req.ip,
          userAgent: req.get('User-Agent'),
        });
        return next(
          new ValidationError(
            'This device has already been used to mark attendance for another student in this session.'
          )
        );
      }
    }

    // Geolocation verification
    let minutesLate = 0;
    let verificationResult = { geolocation: false, qrCode: true };

    if (session.settings?.requireGeolocation && session.location?.coordinates) {
      if (!geolocation?.coordinates) {
        return next(new ValidationError('Geolocation is required for this session'));
      }

      const [sessionLon, sessionLat] = session.location.coordinates;
      const [studentLon, studentLat] = geolocation.coordinates;

      const distance = calculateDistance(sessionLat, sessionLon, studentLat, studentLon);
      const radius = session.geofenceRadius || 100;

      if (distance > radius) {
        return next(
          new ValidationError(
            `You are ${Math.round(distance)}m away from the classroom. Maximum allowed: ${radius}m`,
            [],
            {
              type: 'GEOFENCE_OUTSIDE',
              distanceMeters: Math.round(distance),
              allowedRadiusMeters: radius,
              overByMeters: Math.round(distance - radius),
              classroom: { latitude: sessionLat, longitude: sessionLon },
              yourLocation: { latitude: studentLat, longitude: studentLon },
              hint:
                'Move closer to the classroom, or ask your faculty to widen the session geofence radius.',
            }
          )
        );
      }

      verificationResult.geolocation = true;
    }

    // Calculate minutes late
    const now = new Date();
    const sessionStart = session.sessionDateTime;
    if (now > sessionStart) {
      minutesLate = Math.floor((now - sessionStart) / (1000 * 60));
    }

    // Determine status
    let status = 'present';
    if (minutesLate > (session.settings?.lateThreshold || 15)) {
      if (session.settings?.allowLateEntry) {
        status = 'late';
      } else {
        return next(new AppError('Late entry not allowed for this session', 400));
      }
    }

    // Create attendance record
    const attendance = await Attendance.create({
      session: sessionId,
      course: session.course._id,
      student: req.user._id,
      faculty: session.faculty,
      status,
      checkInTime: now,
      markedAt: now,
      markedBy: 'student',
      minutesLate,
      verification: {
        qrCodeUsed: true,
        qrToken,
        geolocation: geolocation
          ? {
              coordinates: geolocation.coordinates,
              accuracy: geolocation.accuracy,
              timestamp: geolocation.timestamp ? new Date(geolocation.timestamp) : now,
            }
          : undefined,
        deviceInfo: {
          ...(deviceInfo || {}),
          fingerprint: deviceFingerprint,
          userAgent: deviceInfo?.userAgent || req.get('User-Agent'),
          ip: req.ip,
        },
      },
    });

    // Update session metadata
    await Session.findByIdAndUpdate(sessionId, {
      $inc: {
        [`metadata.${status === 'late' ? 'lateCount' : 'presentCount'}`]: 1,
      },
    });

    // Log audit
    await AuditLog.log({
      user: req.user._id,
      action: 'ATTENDANCE_MARKED',
      resource: 'Attendance',
      resourceId: attendance._id,
      details: {
        sessionId,
        courseId: session.course._id,
        status,
        minutesLate,
        verification: verificationResult,
      },
      ip: req.ip,
      userAgent: req.get('User-Agent'),
    });

    // Emit real-time event
    req.io?.to(`session:${sessionId}`).emit('attendance:marked', {
      sessionId,
      studentId: req.user._id,
      studentName: `${req.user.firstName} ${req.user.lastName}`,
      status,
      timestamp: now,
    });

    // Persistent confirmation notification to the student.
    notify({
      recipient: req.user._id,
      type: 'attendance_marked',
      title: 'Attendance recorded',
      body: `You were marked ${status} for ${session.course.code || 'your class'}${
        minutesLate > 0 ? ` (${minutesLate} min late)` : ''
      }.`,
      link: '/student/attendance',
      data: { sessionId, courseId: session.course._id, status },
    });

    res.status(201).json({
      success: true,
      message: 'Attendance marked successfully',
      data: { attendance },
    });
  } catch (error) {
    next(error);
  }
};

export const markAttendanceManual = async (req, res, next) => {
  try {
    const { sessionId, studentId, status, minutesLate, reason } = req.body;

    const session = await Session.findById(sessionId).populate('course');
    if (!session) {
      return next(new NotFoundError('Session'));
    }

    if (req.user.role === 'faculty' && session.faculty.toString() !== req.user._id.toString()) {
      return next(new AuthorizationError('Access denied'));
    }

    // Check enrollment
    const enrollment = await Enrollment.findOne({
      student: studentId,
      course: session.course._id,
      status: 'active',
    });

    if (!enrollment) {
      return next(new ValidationError('Student not enrolled in this course'));
    }

    // Check existing
    let attendance = await Attendance.findOne({
      session: sessionId,
      student: studentId,
    });

    if (attendance) {
      // Update existing
      attendance = await attendance.updateStatus(
        status,
        req.user._id,
        reason || 'Manual update by faculty'
      );
    } else {
      // Create new
      attendance = await Attendance.create({
        session: sessionId,
        course: session.course._id,
        student: studentId,
        faculty: session.faculty,
        status,
        checkInTime: new Date(),
        markedBy: 'faculty',
        minutesLate: minutesLate || 0,
      });
    }

    // Log audit
    await AuditLog.log({
      user: req.user._id,
      action: 'ATTENDANCE_MANUALLY_MARKED',
      resource: 'Attendance',
      resourceId: attendance._id,
      details: { sessionId, studentId, status, minutesLate, reason },
      ip: req.ip,
      userAgent: req.get('User-Agent'),
    });

    // Emit real-time event
    req.io?.to(`session:${sessionId}`).emit('attendance:updated', {
      sessionId,
      studentId,
      status,
      updatedBy: req.user._id,
    });

    res.status(200).json({
      success: true,
      data: { attendance },
    });
  } catch (error) {
    next(error);
  }
};

export const bulkMarkAttendance = async (req, res, next) => {
  try {
    const { sessionId, records } = req.body;

    const session = await Session.findById(sessionId).populate('course');
    if (!session) {
      return next(new NotFoundError('Session'));
    }

    if (req.user.role === 'faculty' && session.faculty.toString() !== req.user._id.toString()) {
      return next(new AuthorizationError('Access denied'));
    }

    // Validate all students are enrolled
    const studentIds = records.map((r) => r.studentId);
    const enrollments = await Enrollment.find({
      student: { $in: studentIds },
      course: session.course._id,
      status: 'active',
    });

    const enrolledIds = new Set(enrollments.map((e) => e.student.toString()));

    const validRecords = records.filter((r) => enrolledIds.has(r.studentId));
    const invalidRecords = records.filter((r) => !enrolledIds.has(r.studentId));

    if (validRecords.length === 0) {
      return next(new ValidationError('No valid enrolled students in records'));
    }

    // Bulk upsert attendance
    const result = await Attendance.bulkMarkAttendance(
      validRecords.map((r) => ({
        sessionId,
        studentId: r.studentId,
        status: r.status,
        minutesLate: r.minutesLate,
        qrToken: null,
        deviceInfo: null,
        changedBy: req.user._id,
        reason: r.reason || 'Bulk marked by faculty',
      }))
    );

    // Log audit
    await AuditLog.log({
      user: req.user._id,
      action: 'ATTENDANCE_BULK_MARKED',
      resource: 'Attendance',
      details: { sessionId, count: validRecords.length, invalidCount: invalidRecords.length },
      ip: req.ip,
      userAgent: req.get('User-Agent'),
    });

    // Emit real-time event
    req.io?.to(`session:${sessionId}`).emit('attendance:bulk_updated', {
      sessionId,
      count: validRecords.length,
    });

    res.status(200).json({
      success: true,
      data: {
        updated: result.modifiedCount + result.upsertedCount,
        invalid: invalidRecords.length,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const updateAttendance = async (req, res, next) => {
  try {
    const { status, minutesLate, excuse } = req.body;
    const attendance = await Attendance.findById(req.params.id);

    if (!attendance) {
      return next(new NotFoundError('Attendance record'));
    }

    // Check authorization
    const session = await Session.findById(attendance.session).populate('course');
    if (req.user.role === 'faculty' && session.faculty.toString() !== req.user._id.toString()) {
      return next(new AuthorizationError('You can only update attendance for your sessions'));
    }

    const oldStatus = attendance.status;
    attendance.status = status || attendance.status;
    attendance.minutesLate = minutesLate !== undefined ? minutesLate : attendance.minutesLate;

    if (excuse) {
      attendance.excuse = {
        isExcused: true,
        reason: excuse.reason,
        documentUrl: excuse.documentUrl,
        approvedBy: req.user._id,
        approvedAt: new Date(),
      };
      if (excuse.reason) attendance.status = 'excused';
    }

    await attendance.save();

    // Log audit
    await AuditLog.log({
      user: req.user._id,
      action: 'ATTENDANCE_UPDATED',
      resource: 'Attendance',
      resourceId: attendance._id,
      details: { oldStatus, newStatus: attendance.status, minutesLate },
      ip: req.ip,
      userAgent: req.get('User-Agent'),
    });

    // Emit real-time event
    req.io?.to(`session:${attendance.session}`).emit('attendance:updated', {
      sessionId: attendance.session,
      attendanceId: attendance._id,
      studentId: attendance.student,
      newStatus: attendance.status,
      updatedBy: req.user._id,
    });

    res.status(200).json({
      success: true,
      data: { attendance },
    });
  } catch (error) {
    next(error);
  }
};

export const getStudentAttendance = async (req, res, next) => {
  try {
    const { courseId, page = 1, limit = 20, status, sort = '-markedAt' } = req.query;
    const studentId = req.params.studentId?.toString() || req.user._id.toString();

    // Authorization
    if (req.user.role === 'student' && studentId !== req.user._id.toString()) {
      return next(new AuthorizationError('You can only view your own attendance'));
    }

    if (req.user.role === 'faculty') {
      // Faculty can only view attendance for their courses
      const courses = await Course.find({ faculty: req.user._id }).select('_id');
      const courseIds = courses.map((c) => c._id.toString());

      if (courseId && !courseIds.includes(courseId)) {
        return next(new AuthorizationError('You can only view attendance for your courses'));
      }
    }

    const query = { student: studentId };
    if (courseId) query.course = courseId;
    if (status) query.status = status;

    const skip = (page - 1) * limit;

    const [attendance, total] = await Promise.all([
      Attendance.find(query)
        .populate('session', 'title date startTime endTime status')
        .populate('course', 'code name')
        .populate('faculty', 'firstName lastName')
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit)),
      Attendance.countDocuments(query),
    ]);

    res.status(200).json({
      success: true,
      data: { attendance },
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

export const getSessionAttendance = async (req, res, next) => {
  try {
    const { page = 1, limit = 50, status, sort = 'student' } = req.query;
    const sessionId = req.params.sessionId;

    const session = await Session.findById(sessionId).populate('course');
    if (!session) {
      return next(new NotFoundError('Session'));
    }

    if (req.user.role === 'faculty' && session.faculty.toString() !== req.user._id.toString()) {
      return next(new AuthorizationError('Access denied'));
    }

    if (req.user.role === 'student') {
      const enrollment = await Enrollment.findOne({
        student: req.user._id,
        course: session.course._id,
        status: 'active',
      });
      if (!enrollment) {
        return next(new AuthorizationError('Not enrolled in this course'));
      }
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

export const getAttendanceSummary = async (req, res, next) => {
  try {
    const { courseId } = req.query;
    const studentId = req.user._id;

    if (req.user.role === 'student') {
      const summary = await Attendance.getStudentSummary(studentId, courseId);
      return res.status(200).json({
        success: true,
        data: { summary },
      });
    }

    if (req.user.role === 'faculty') {
      if (!courseId) {
        return next(new ValidationError('Course ID is required for faculty'));
      }

      const course = await Course.findById(courseId);
      if (!course || course.faculty.toString() !== req.user._id.toString()) {
        return next(new AuthorizationError('Access denied'));
      }

      const stats = await Attendance.getCourseStats(courseId);
      return res.status(200).json({
        success: true,
        data: { stats },
      });
    }

    // Admin can view any summary
    const summary = await Attendance.getStudentSummary(studentId, courseId);
    res.status(200).json({
      success: true,
      data: { summary },
    });
  } catch (error) {
    next(error);
  }
};

export const getCourseAttendanceStats = async (req, res, next) => {
  try {
    const { courseId } = req.params;

    const course = await Course.findById(courseId);
    if (!course) {
      return next(new NotFoundError('Course'));
    }

    if (req.user.role === 'faculty' && course.faculty.toString() !== req.user._id.toString()) {
      return next(new AuthorizationError('Access denied'));
    }

    const stats = await Attendance.getCourseStats(courseId);

    // Get per-session stats
    const sessionStats = await Attendance.aggregate([
      { $match: { course: course._id } },
      {
        $group: {
          _id: '$session',
          present: { $sum: { $cond: [{ $eq: ['$status', 'present'] }, 1, 0] } },
          late: { $sum: { $cond: [{ $eq: ['$status', 'late'] }, 1, 0] } },
          absent: { $sum: { $cond: [{ $eq: ['$status', 'absent'] }, 1, 0] } },
          excused: { $sum: { $cond: [{ $eq: ['$status', 'excused'] }, 1, 0] } },
        },
      },
      {
        $lookup: {
          from: 'sessions',
          localField: '_id',
          foreignField: '_id',
          as: 'session',
        },
      },
      { $unwind: '$session' },
      {
        $project: {
          sessionId: '$_id',
          sessionTitle: '$session.title',
          sessionDate: '$session.date',
          present: 1,
          late: 1,
          absent: 1,
          excused: 1,
          total: { $add: ['$present', '$late', '$absent', '$excused'] },
        },
      },
      { $sort: { sessionDate: -1 } },
    ]);

    res.status(200).json({
      success: true,
      data: {
        course: { code: course.code, name: course.name },
        overall: stats,
        sessions: sessionStats,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getLowAttendanceStudents = async (req, res, next) => {
  try {
    const { threshold = 75, courseId } = req.query;

    // Authorization
    let query = {};
    if (req.user.role === 'faculty') {
      const courses = await Course.find({ faculty: req.user._id }).select('_id');
      query.faculty = req.user._id;
      if (courseId) {
        if (!courses.some((c) => c._id.toString() === courseId)) {
          return next(new AuthorizationError('Access denied'));
        }
        query.course = courseId;
      }
    } else if (courseId) {
      query.course = courseId;
    }

    const students = await Attendance.getLowAttendanceStudents(parseFloat(threshold), query);

    res.status(200).json({
      success: true,
      data: { students, threshold: parseFloat(threshold) },
    });
  } catch (error) {
    next(error);
  }
};

export const exportAttendance = async (req, res, next) => {
  try {
    const { courseId, sessionId, format = 'csv', startDate, endDate } = req.query;

    // Authorization
    if (req.user.role === 'faculty') {
      const courses = await Course.find({ faculty: req.user._id }).select('_id');
      const courseIds = courses.map((c) => c._id.toString());

      if (courseId && !courseIds.includes(courseId)) {
        return next(new AuthorizationError('Access denied'));
      }
    }

    const query = {};
    if (courseId) query.course = courseId;
    if (sessionId) query.session = sessionId;
    if (startDate || endDate) {
      query.markedAt = {};
      if (startDate) query.markedAt.$gte = new Date(startDate);
      if (endDate) query.markedAt.$lte = new Date(endDate);
    }

    const attendance = await Attendance.find(query)
      .populate('student', 'firstName lastName studentId email')
      .populate('session', 'title date startTime')
      .populate('course', 'code name')
      .sort({ markedAt: -1 });

    // Format for CSV
    const csvData = attendance.map((a) => ({
      studentId: a.student.studentId,
      studentName: `${a.student.firstName} ${a.student.lastName}`,
      studentEmail: a.student.email,
      courseCode: a.course.code,
      courseName: a.course.name,
      sessionTitle: a.session.title,
      sessionDate: a.session.date.toISOString().split('T')[0],
      sessionTime: a.session.startTime,
      status: a.status,
      checkInTime: a.checkInTime?.toISOString(),
      minutesLate: a.minutesLate,
      markedBy: a.markedBy,
      verification: JSON.stringify(a.verification),
    }));

    if (format === 'csv') {
      const fields = Object.keys(csvData[0] || {});
      const header = fields.join(',');
      const rows = csvData
        .map((row) => fields.map((f) => `"${row[f] || ''}"`).join(','))
        .join('\n');
      const csv = header + '\n' + rows;

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=attendance-${Date.now()}.csv`);
      return res.send(csv);
    }

    res.status(200).json({
      success: true,
      data: { attendance: csvData },
    });
  } catch (error) {
    next(error);
  }
};
