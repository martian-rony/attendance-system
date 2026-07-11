import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Session from '../models/Session.js';
import Course from '../models/Course.js';
import Enrollment from '../models/Enrollment.js';
import { logger } from '../utils/logger.js';

let io = null;

export const initializeSocket = (server) => {
  const isProd = process.env.NODE_ENV === 'production';
  const configured = (process.env.CLIENT_URL || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  // CORS origin for Socket.io:
  // - dev: localhost:5173 (or CLIENT_URL if set)
  // - prod with CLIENT_URL: only that origin (set automatically from
  //   RENDER_EXTERNAL_URL on Render, or supply your own domain)
  // - prod without CLIENT_URL: reflect the request origin. Safe because every
  //   socket connection is gated by JWT auth in the middleware below.
  const socketCors = isProd
    ? configured.length
      ? { origin: configured, methods: ['GET', 'POST'], credentials: true }
      : { origin: true, methods: ['GET', 'POST'], credentials: true }
    : {
        origin: configured.length ? configured : 'http://localhost:5173',
        methods: ['GET', 'POST'],
        credentials: true,
      };

  io = new Server(server, {
    cors: socketCors,
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // Authentication middleware for socket
  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) {
      return next(new Error('Authentication error: No token provided'));
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.userId).select('+passwordHash');
      if (!user || !user.isActive) {
        return next(new Error('Authentication error: User not found'));
      }
      socket.user = user;
      next();
    } catch (error) {
      next(new Error('Authentication error: Invalid token'));
    }
  });

  io.on('connection', async (socket) => {
    logger.info(`Socket connected: ${socket.id} (User: ${socket.user?.email})`);

    // Join personal room
    socket.join(`user:${socket.user._id}`);

    // Join role-based room
    socket.join(`role:${socket.user.role}`);

    // Faculty joins their courses rooms
    if (socket.user.role === 'faculty') {
      const courses = await Course.find({ faculty: socket.user._id }).select('_id');
      courses.forEach((c) => socket.join(`course:${c._id}`));
    }

    // Student joins enrolled course rooms
    if (socket.user.role === 'student') {
      const enrollments = await Enrollment.find({
        student: socket.user._id,
        status: 'active',
      }).select('course');
      enrollments.forEach((e) => socket.join(`course:${e.course}`));
    }

    // Generic room join/leave (frontend SocketContext.joinRoom emits 'join' with a room string)
    socket.on('join', (room) => {
      if (typeof room === 'string' && room.length < 100) socket.join(room);
    });
    socket.on('leave', (room) => {
      if (typeof room === 'string') socket.leave(room);
    });
    // Event handlers
    handleSessionEvents(socket);
    handleAttendanceEvents(socket);

    socket.on('disconnect', (reason) => {
      logger.info(`Socket disconnected: ${socket.id} (${reason})`);
    });

    socket.on('error', (error) => {
      logger.error('Socket error:', error);
    });
  });

  // Attach io to app for use in controllers
  global.io = io;

  return io;
};

export const getIO = () => {
  if (!io) {
    throw new Error('Socket.io not initialized');
  }
  return io;
};

// Session-related socket events
const handleSessionEvents = (socket) => {
  // Faculty starts a session
  socket.on('session:start', async (data) => {
    try {
      const session = await Session.findById(data.sessionId);
      if (!session) return;

      if (
        session.faculty.toString() !== socket.user._id.toString() &&
        socket.user.role !== 'admin'
      ) {
        socket.emit('error', { message: 'Not authorized' });
        return;
      }

      // Join session room
      socket.join(`session:${session._id}`);

      // Notify course room
      socket.to(`course:${session.course}`).emit('session:started', {
        sessionId: session._id,
        courseId: session.course,
        facultyName: `${socket.user.firstName} ${socket.user.lastName}`,
        qrToken: session.qrCode?.data,
        expiresAt: session.qrCode?.expiresAt,
      });

      logger.info(`Session started via socket: ${session._id}`);
    } catch (error) {
      logger.error('Session start socket error:', error);
    }
  });

  // Faculty ends a session
  socket.on('session:end', async (data) => {
    try {
      const session = await Session.findById(data.sessionId);
      if (!session) return;

      if (
        session.faculty.toString() !== socket.user._id.toString() &&
        socket.user.role !== 'admin'
      ) {
        socket.emit('error', { message: 'Not authorized' });
        return;
      }

      socket.to(`session:${session._id}`).emit('session:ended', {
        sessionId: session._id,
      });

      socket.leave(`session:${session._id}`);
    } catch (error) {
      logger.error('Session end socket error:', error);
    }
  });

  // Join/leave session room (student trying to mark)
  socket.on('session:join', (data) => {
    socket.join(`session:${data.sessionId}`);
  });

  socket.on('session:leave', (data) => {
    socket.leave(`session:${data.sessionId}`);
  });
};

// Attendance-related socket events
const handleAttendanceEvents = (socket) => {
  // Student marks attendance
  socket.on('attendance:mark', async (data) => {
    try {
      const session = await Session.findById(data.sessionId);
      if (!session) return;

      // Emit to faculty/admin monitoring this session
      socket.to(`session:${data.sessionId}`).emit('attendance:marked', {
        sessionId: data.sessionId,
        studentId: socket.user._id,
        studentName: `${socket.user.firstName} ${socket.user.lastName}`,
        status: data.status || 'present',
        timestamp: new Date(),
      });

      logger.info(
        `Attendance marked via socket: ${socket.user.email} for session ${data.sessionId}`
      );
    } catch (error) {
      logger.error('Attendance mark socket error:', error);
    }
  });

  // Request live stats
  socket.on('stats:request', async (data) => {
    try {
      const session = await Session.findById(data.sessionId).populate('course');
      if (!session) return;

      // Authorization check
      if (
        session.faculty.toString() !== socket.user._id.toString() &&
        socket.user.role !== 'admin'
      ) {
        return;
      }

      // Calculate live stats
      const Attendance = (await import('../models/Attendance.js')).default;
      const stats = await Attendance.aggregate([
        { $match: { session: session._id } },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
          },
        },
      ]);

      const result = { present: 0, absent: 0, late: 0, excused: 0, total: 0 };
      stats.forEach((s) => {
        result[s._id] = s.count;
        result.total += s.count;
      });

      socket.emit('stats:update', {
        sessionId: data.sessionId,
        stats: result,
      });
    } catch (error) {
      logger.error('Stats request socket error:', error);
    }
  });
};

// Helper to emit to a room
export const emitToRoom = (room, event, data) => {
  if (io) {
    io.to(room).emit(event, data);
  }
};

export const emitToUser = (userId, event, data) => {
  if (io) {
    io.to(`user:${userId}`).emit(event, data);
  }
};

export const emitToCourse = (courseId, event, data) => {
  if (io) {
    io.to(`course:${courseId}`).emit(event, data);
  }
};

export const emitToSession = (sessionId, event, data) => {
  if (io) {
    io.to(`session:${sessionId}`).emit(event, data);
  }
};

export { io };
