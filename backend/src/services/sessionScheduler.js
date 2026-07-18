import Session from '../models/Session.js';
import Enrollment from '../models/Enrollment.js';
import Attendance from '../models/Attendance.js';
import { logger } from '../utils/logger.js';
import { emitToRoom } from '../socket/handlers.js';
import { notifyMany } from './notificationService.js';

/**
 * Session auto-lifecycle scheduler.
 *
 * Runs on an interval and, for each session:
 *  - AUTO-START: a 'scheduled' session whose attendance window has opened
 *    (now >= windowOpenTime) and hasn't closed becomes 'active'. Enrolled
 *    students are notified.
 *  - AUTO-END: an 'active' session whose window has closed (now > windowCloseTime)
 *    becomes 'completed'; absent students get marked absent; QR is deactivated.
 *
 * This makes recurring/timetable sessions hands-free — faculty no longer must
 * click Start/End. Manual start/end still works and simply short-circuits the
 * scheduler (status already changed).
 *
 * Idempotent and safe to run repeatedly. Interval configurable via
 * SESSION_SCHEDULER_INTERVAL_MS (default 60s). Disable with
 * SESSION_AUTO_LIFECYCLE=false.
 */

let timer = null;

async function autoStartDueSessions() {
  const now = new Date();
  // Candidate scheduled sessions whose date is today-ish. We over-select then
  // filter with the virtual (windowOpenTime) which needs a full doc.
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const candidates = await Session.find({
    status: 'scheduled',
    date: { $gte: dayAgo },
  });

  for (const session of candidates) {
    try {
      if (now >= session.windowOpenTime && now <= session.windowCloseTime) {
        await session.startSession();
        if (!session.qrCode?.isActive) await session.generateQRCode();

        const enrolledCount = await Enrollment.countDocuments({
          course: session.course,
          status: 'active',
        });
        session.metadata.totalStudents = enrolledCount;
        await session.save();

        emitToRoom(`course:${session.course}`, 'session:started', {
          sessionId: session._id,
          courseId: session.course,
          auto: true,
        });

        const enrollments = await Enrollment.find({
          course: session.course,
          status: 'active',
        }).select('student');
        await notifyMany(
          enrollments.map((e) => e.student),
          {
            type: 'session_started',
            title: 'Attendance session started',
            body: `${session.title || 'A session'} is now open. Scan the QR code to mark your attendance.`,
            link: '/student/scan',
            data: { sessionId: session._id, courseId: session.course },
          }
        );

        logger.info(`Auto-started session ${session._id}`);
      }
    } catch (err) {
      logger.error(`Auto-start failed for session ${session._id}: ${err.message}`);
    }
  }
}

async function autoEndDueSessions() {
  const now = new Date();
  const active = await Session.find({ status: 'active' });

  for (const session of active) {
    try {
      if (now > session.windowCloseTime) {
        await session.endSession();

        // Mark enrolled-but-unmarked students absent.
        const enrollments = await Enrollment.find({
          course: session.course,
          status: 'active',
        }).select('student');
        const marked = await Attendance.find({ session: session._id }).select('student');
        const markedSet = new Set(marked.map((m) => m.student.toString()));

        const absentDocs = enrollments
          .filter((e) => !markedSet.has(e.student.toString()))
          .map((e) => ({
            session: session._id,
            course: session.course,
            student: e.student,
            faculty: session.faculty,
            status: 'absent',
            markedBy: 'auto',
            markedAt: now,
          }));

        if (absentDocs.length > 0) {
          await Attendance.insertMany(absentDocs, { ordered: false }).catch((e) => {
            // Ignore dup-key races (a student marked at the last second).
            if (e.code !== 11000) throw e;
          });
        }

        emitToRoom(`session:${session._id}`, 'session:ended', {
          sessionId: session._id,
          auto: true,
        });

        logger.info(
          `Auto-ended session ${session._id} (${absentDocs.length} marked absent)`
        );
      }
    } catch (err) {
      logger.error(`Auto-end failed for session ${session._id}: ${err.message}`);
    }
  }
}

async function tick() {
  try {
    await autoStartDueSessions();
    await autoEndDueSessions();
  } catch (err) {
    logger.error('Session scheduler tick failed:', err);
  }
}

export function startSessionScheduler() {
  if (process.env.SESSION_AUTO_LIFECYCLE === 'false') {
    logger.info('Session auto-lifecycle scheduler disabled via env');
    return null;
  }
  const interval = parseInt(process.env.SESSION_SCHEDULER_INTERVAL_MS, 10) || 60000;
  if (timer) clearInterval(timer);
  // Kick once shortly after boot, then on the interval.
  setTimeout(tick, 5000);
  timer = setInterval(tick, interval);
  logger.info(`Session auto-lifecycle scheduler started (every ${interval}ms)`);
  return timer;
}

export function stopSessionScheduler() {
  if (timer) clearInterval(timer);
  timer = null;
}
