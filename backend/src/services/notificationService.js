import Notification from '../models/Notification.js';
import Enrollment from '../models/Enrollment.js';
import { emitToUser } from '../socket/handlers.js';
import { logger } from '../utils/logger.js';

/**
 * Notification service.
 * Single entry point for creating notifications. Every helper both persists
 * the record (durable inbox / unread count) AND pushes it live to the
 * recipient's personal socket room (`user:<id>`), so the bell updates in
 * real time and survives reconnects.
 *
 * All functions are best-effort: a notification failure must never break the
 * primary request (marking attendance, starting a session, etc.), so callers
 * do not need to await or try/catch — errors are swallowed and logged here.
 */

/**
 * Create a single notification for one recipient and push it live.
 * @returns {Promise<Notification|null>}
 */
export const notify = async ({ recipient, type, title, body = '', link = null, data = {} }) => {
  try {
    if (!recipient) return null;
    const notification = await Notification.create({
      recipient,
      type,
      title,
      body,
      link,
      data,
    });

    // Push live to the recipient's personal room.
    emitToUser(recipient, 'notification:new', {
      _id: notification._id,
      type: notification.type,
      title: notification.title,
      body: notification.body,
      link: notification.link,
      data: notification.data,
      read: false,
      createdAt: notification.createdAt,
    });

    return notification;
  } catch (error) {
    logger.error('notify() failed:', error);
    return null;
  }
};

/**
 * Fan out the same notification to many recipients.
 * Persists in one bulk insert, then pushes each live.
 * @param {Array<string|ObjectId>} recipients
 */
export const notifyMany = async (recipients, { type, title, body = '', link = null, data = {} }) => {
  try {
    const unique = [...new Set((recipients || []).map((r) => r.toString()))];
    if (unique.length === 0) return [];

    const docs = unique.map((recipient) => ({
      recipient,
      type,
      title,
      body,
      link,
      data,
    }));

    const created = await Notification.insertMany(docs, { ordered: false });

    created.forEach((n) => {
      emitToUser(n.recipient, 'notification:new', {
        _id: n._id,
        type: n.type,
        title: n.title,
        body: n.body,
        link: n.link,
        data: n.data,
        read: false,
        createdAt: n.createdAt,
      });
    });

    return created;
  } catch (error) {
    logger.error('notifyMany() failed:', error);
    return [];
  }
};

/**
 * Notify every actively-enrolled student of a course.
 * Optionally exclude a user (e.g. the actor who triggered the event).
 */
export const notifyCourseStudents = async (courseId, payload, { exclude = null } = {}) => {
  try {
    const enrollments = await Enrollment.find({ course: courseId, status: 'active' }).select(
      'student'
    );
    let recipients = enrollments.map((e) => e.student);
    if (exclude) {
      const ex = exclude.toString();
      recipients = recipients.filter((r) => r.toString() !== ex);
    }
    return notifyMany(recipients, payload);
  } catch (error) {
    logger.error('notifyCourseStudents() failed:', error);
    return [];
  }
};
