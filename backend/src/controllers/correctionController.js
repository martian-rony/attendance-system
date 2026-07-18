import AttendanceCorrection from '../models/AttendanceCorrection.js';
import Attendance from '../models/Attendance.js';
import Session from '../models/Session.js';
import Enrollment from '../models/Enrollment.js';
import AuditLog from '../models/AuditLog.js';
import { AppError, NotFoundError, AuthorizationError, ValidationError } from '../utils/AppError.js';
import { notify } from '../services/notificationService.js';

/**
 * POST /api/corrections
 * Student requests a correction/dispute for a session's attendance.
 */
export const createCorrection = async (req, res, next) => {
  try {
    const { sessionId, requestedStatus, reason, evidenceUrl } = req.body;

    const session = await Session.findById(sessionId).populate('course', 'code name');
    if (!session) return next(new NotFoundError('Session'));

    // Student must be enrolled in the course.
    const enrollment = await Enrollment.findOne({
      student: req.user._id,
      course: session.course._id,
      status: 'active',
    });
    if (!enrollment) {
      return next(new AuthorizationError('You are not enrolled in this course'));
    }

    // Link the existing attendance record if one exists.
    const attendance = await Attendance.findOne({
      session: sessionId,
      student: req.user._id,
    });

    // Guard against duplicate pending requests (also enforced by unique index).
    const existingPending = await AttendanceCorrection.findOne({
      student: req.user._id,
      session: sessionId,
      status: 'pending',
    });
    if (existingPending) {
      return next(new ValidationError('You already have a pending correction for this session'));
    }

    const correction = await AttendanceCorrection.create({
      student: req.user._id,
      session: sessionId,
      course: session.course._id,
      faculty: session.faculty,
      attendance: attendance?._id || null,
      requestedStatus,
      reason,
      evidenceUrl: evidenceUrl || null,
    });

    await AuditLog.log({
      user: req.user._id,
      action: 'CORRECTION_REQUESTED',
      resource: 'AttendanceCorrection',
      resourceId: correction._id,
      details: { sessionId, requestedStatus },
      ip: req.ip,
      userAgent: req.get('User-Agent'),
    });

    // Notify the faculty who owns the session.
    notify({
      recipient: session.faculty,
      type: 'correction_requested',
      title: 'Attendance correction requested',
      body: `${req.user.firstName} ${req.user.lastName} requested a correction for ${
        session.course.code
      } (${session.title || 'session'}).`,
      link: '/faculty/corrections',
      data: { correctionId: correction._id, sessionId },
    });

    res.status(201).json({ success: true, data: { correction } });
  } catch (error) {
    // Duplicate-key from the unique partial index.
    if (error.code === 11000) {
      return next(new ValidationError('You already have a pending correction for this session'));
    }
    next(error);
  }
};

/**
 * GET /api/corrections
 * Role-filtered list. Students see their own; faculty see requests for their
 * sessions; admins see everything. Optional ?status= filter.
 */
export const getCorrections = async (req, res, next) => {
  try {
    const filter = {};
    if (req.user.role === 'student') filter.student = req.user._id;
    else if (req.user.role === 'faculty') filter.faculty = req.user._id;
    if (req.query.status) filter.status = req.query.status;

    const corrections = await AttendanceCorrection.find(filter)
      .populate('student', 'firstName lastName email')
      .populate('course', 'code name')
      .populate('session', 'title date startTime')
      .populate('resolvedBy', 'firstName lastName')
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json({ success: true, data: { corrections } });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/corrections/:id/resolve
 * Faculty/admin approve or reject. On approval, the linked attendance record
 * is updated (or created if the student was never marked).
 * Body: { decision: 'approved'|'rejected', resolutionNote? }
 */
export const resolveCorrection = async (req, res, next) => {
  try {
    const { decision, resolutionNote } = req.body;
    if (!['approved', 'rejected'].includes(decision)) {
      return next(new ValidationError('decision must be "approved" or "rejected"'));
    }

    let attendance = null;

    const correction = await AttendanceCorrection.findById(req.params.id).populate(
      'session',
      'faculty course'
    );
    if (!correction) return next(new NotFoundError('Correction'));

    if (correction.status !== 'pending') {
      return next(new AppError('This correction has already been resolved', 400));
    }

    // Only the owning faculty or an admin may resolve.
    if (
      req.user.role === 'faculty' &&
      correction.faculty.toString() !== req.user._id.toString()
    ) {
      return next(new AuthorizationError('You can only resolve corrections for your sessions'));
    }

    if (decision === 'approved') {
      attendance = correction.attendance
        ? await Attendance.findById(correction.attendance)
        : null;

      if (attendance) {
        const oldStatus = attendance.status;
        attendance.status = correction.requestedStatus;
        attendance.history.push({
          status: correction.requestedStatus,
          changedBy: req.user._id,
          reason: `Correction approved: ${correction.reason}`,
        });
        await attendance.save();
        await AuditLog.log({
          user: req.user._id,
          action: 'CORRECTION_APPROVED',
          resource: 'Attendance',
          resourceId: attendance._id,
          details: { oldStatus, newStatus: attendance.status, correctionId: correction._id },
          ip: req.ip,
          userAgent: req.get('User-Agent'),
        });
      } else {
        // Student was never marked — create a record now.
        attendance = await Attendance.create({
          session: correction.session._id,
          course: correction.course,
          student: correction.student,
          faculty: correction.faculty,
          status: correction.requestedStatus,
          markedAt: new Date(),
          markedBy: 'faculty',
          history: [
            {
              status: correction.requestedStatus,
              changedBy: req.user._id,
              reason: `Correction approved (no prior record): ${correction.reason}`,
            },
          ],
        });
        correction.attendance = attendance._id;
        await AuditLog.log({
          user: req.user._id,
          action: 'CORRECTION_APPROVED_CREATED',
          resource: 'Attendance',
          resourceId: attendance._id,
          details: { newStatus: attendance.status, correctionId: correction._id },
          ip: req.ip,
          userAgent: req.get('User-Agent'),
        });
      }

      req.io?.to(`session:${correction.session._id}`).emit('attendance:updated', {
        sessionId: correction.session._id,
        attendanceId: attendance._id,
        studentId: correction.student,
        newStatus: attendance.status,
        updatedBy: req.user._id,
      });
    } else {
      await AuditLog.log({
        user: req.user._id,
        action: 'CORRECTION_REJECTED',
        resource: 'AttendanceCorrection',
        resourceId: correction._id,
        details: { correctionId: correction._id },
        ip: req.ip,
        userAgent: req.get('User-Agent'),
      });
    }

    correction.status = decision;
    correction.resolvedBy = req.user._id;
    correction.resolvedAt = new Date();
    correction.resolutionNote = resolutionNote || null;
    await correction.save();

    // Notify the student of the outcome.
    notify({
      recipient: correction.student,
      type: 'correction_resolved',
      title: `Correction ${decision}`,
      body:
        decision === 'approved'
          ? `Your attendance correction was approved and updated to "${correction.requestedStatus}".`
          : `Your attendance correction was rejected.${
              resolutionNote ? ` Note: ${resolutionNote}` : ''
            }`,
      link: '/student/attendance',
      data: { correctionId: correction._id, decision },
    });

    res.status(200).json({ success: true, data: { correction, attendance } });
  } catch (error) {
    next(error);
  }
};
