import mongoose from 'mongoose';
import crypto from 'crypto';

// Bump commit to force a fresh Render build (no behavior change).

const qrCodeSchema = new mongoose.Schema(
  {
    data: {
      type: String,
      required: true,
    },
    imageUrl: {
      type: String,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { _id: false }
);

const attendanceWindowSchema = new mongoose.Schema(
  {
    openBefore: {
      type: Number,
      default: 10,
      min: 0,
      max: 60,
    },
    closeAfter: {
      type: Number,
      default: 30,
      min: 0,
      max: 120,
    },
  },
  { _id: false }
);

const locationSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point',
    },
    coordinates: {
      type: [Number],
      validate: {
        validator: function (v) {
          return v.length === 2 && v[0] >= -180 && v[0] <= 180 && v[1] >= -90 && v[1] <= 90;
        },
        message: 'Invalid coordinates',
      },
    },
  },
  { _id: false }
);

locationSchema.index({ coordinates: '2dsphere' });

const sessionSchema = new mongoose.Schema(
  {
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Course',
      required: [true, 'Course is required'],
    },
    faculty: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Faculty is required'],
    },
    title: {
      type: String,
      required: [true, 'Session title is required'],
      trim: true,
      maxlength: 200,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 2000,
    },
    date: {
      type: Date,
      required: [true, 'Session date is required'],
    },
    startTime: {
      type: String,
      required: [true, 'Start time is required'],
      match: /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/,
    },
    endTime: {
      type: String,
      required: [true, 'End time is required'],
      match: /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/,
    },
    // Absolute UTC instants for the attendance window. Derived by the client
    // from its LOCAL wall-clock so the window is timezone-stable on the server.
    startDateTime: { type: Date },
    endDateTime: { type: Date },
    room: {
      type: String,
      trim: true,
      maxlength: 50,
    },
    qrCode: qrCodeSchema,
    attendanceWindow: {
      type: attendanceWindowSchema,
      default: () => ({ openBefore: 10, closeAfter: 30 }),
    },
    location: locationSchema,
    geofenceRadius: {
      type: Number,
      default: 100,
      min: 10,
      max: 1000,
    },
    settings: {
      allowLateEntry: { type: Boolean, default: true },
      lateThreshold: { type: Number, default: 15, min: 1, max: 60 },
      requireGeolocation: { type: Boolean, default: true },
      // Anti-screenshot: when true, students must present a valid short-lived
      // rotating token (in addition to QR + geo). Off by default so existing
      // flows are unaffected until a faculty opts in.
      rotatingQR: { type: Boolean, default: false },
      // Anti-proxy: block a second student marking from the same device in the
      // same session. On by default — purely additive, never blocks a normal
      // single-student scan.
      blockDeviceReuse: { type: Boolean, default: true },
    },
    status: {
      type: String,
      enum: ['scheduled', 'active', 'completed', 'cancelled'],
      default: 'scheduled',
    },
    startedAt: {
      type: Date,
    },
    endedAt: {
      type: Date,
    },
    metadata: {
      totalStudents: { type: Number, default: 0 },
      presentCount: { type: Number, default: 0 },
      absentCount: { type: Number, default: 0 },
      lateCount: { type: Number, default: 0 },
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes
sessionSchema.index({ course: 1, date: -1 });
sessionSchema.index({ faculty: 1, date: -1 });
sessionSchema.index({ status: 1, date: 1 });
sessionSchema.index({ 'qrCode.data': 1 });
sessionSchema.index({ location: '2dsphere' });

// Virtual for attendance records
sessionSchema.virtual('attendanceRecords', {
  ref: 'Attendance',
  localField: '_id',
  foreignField: 'session',
});

// Virtual for is currently active
sessionSchema.virtual('isActive').get(function () {
  return this.status === 'active';
});

// Virtual for session datetime. Prefer the absolute UTC instant sent by the
// client (timezone-stable). Fall back to reconstructing from the wall-clock
// strings only for legacy docs that lack startDateTime.
sessionSchema.virtual('sessionDateTime').get(function () {
  if (this.startDateTime) return this.startDateTime;
  if (!this.startTime) return null;
  const [hours, minutes] = this.startTime.split(':');
  const d = new Date(this.date);
  return new Date(
    d.getFullYear(),
    d.getMonth(),
    d.getDate(),
    parseInt(hours),
    parseInt(minutes),
    0,
    0
  );
});

// Virtual for session end datetime
sessionSchema.virtual('sessionEndDateTime').get(function () {
  if (this.endDateTime) return this.endDateTime;
  if (!this.endTime) return null;
  const [hours, minutes] = this.endTime.split(':');
  const dt = new Date(this.date);
  dt.setHours(parseInt(hours), parseInt(minutes), 0, 0);
  return dt;
});

// Virtual for attendance window open time
sessionSchema.virtual('windowOpenTime').get(function () {
  const openBefore = this.attendanceWindow?.openBefore ?? 10;
  const dt = this.sessionDateTime;
  if (!dt || !(dt instanceof Date)) return null;
  const out = new Date(dt.getTime());
  out.setMinutes(out.getMinutes() - openBefore);
  return out;
});

// Virtual for attendance window close time
sessionSchema.virtual('windowCloseTime').get(function () {
  const closeAfter = this.attendanceWindow?.closeAfter ?? 30;
  const dt = this.sessionDateTime;
  if (!dt || !(dt instanceof Date)) return null;
  const out = new Date(dt.getTime());
  out.setMinutes(out.getMinutes() + closeAfter);
  // Never close the window before the class actually ends — for any session
  // longer than `closeAfter` minutes, stay open through the whole period so a
  // student inside the geofence and inside the scheduled time can still mark.
  // If `closeAfter` is larger than the session length, that later time wins.
  const end = this.sessionEndDateTime;
  return end && end instanceof Date && end.getTime() > out.getTime() ? end : out;
});

// Virtual for is within attendance window
sessionSchema.virtual('isWithinWindow').get(function () {
  const open = this.windowOpenTime;
  const close = this.windowCloseTime;
  if (!open || !close) return false;
  const now = new Date();
  return now >= open && now <= close;
});

// Method to generate QR code
sessionSchema.methods.generateQRCode = async function () {
  const payload = {
    sessionId: this._id.toString(),
    courseId: this.course.toString(),
    facultyId: this.faculty.toString(),
    timestamp: Date.now(),
    nonce: crypto.randomBytes(8).toString('hex'),
  };

  // Encrypt/sign the payload. QR_CODE_SECRET is guaranteed to be set by
  // config/env.js (required in production; dev fallback otherwise).
  const secret = process.env.QR_CODE_SECRET;
  if (!secret) {
    throw new Error('QR_CODE_SECRET is not configured');
  }
  const token = crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(payload))
    .digest('hex')
    .substring(0, 32);

  const qrData = JSON.stringify({
    ...payload,
    token,
  });

  const expiresAt = new Date();
  expiresAt.setMinutes(
    expiresAt.getMinutes() + parseInt(process.env.QR_CODE_EXPIRY_MINUTES) || 120
  );

  this.qrCode = {
    data: qrData,
    expiresAt,
    isActive: true,
  };

  await this.save();
  return this.qrCode;
};

// Method to validate QR code
sessionSchema.methods.validateQRCode = function (qrToken) {
  if (!this.qrCode || !this.qrCode.isActive) {
    return { valid: false, reason: 'QR code not active' };
  }

  if (new Date() > this.qrCode.expiresAt) {
    return { valid: false, reason: 'QR code expired' };
  }

  // Verify token
  try {
    const qrData = JSON.parse(this.qrCode.data);
    if (qrData.token !== qrToken) {
      return { valid: false, reason: 'Invalid QR token' };
    }
    return { valid: true, data: qrData };
  } catch (e) {
    return { valid: false, reason: 'Invalid QR data' };
  }
};

// Method to start session
sessionSchema.methods.startSession = async function () {
  this.status = 'active';
  this.startedAt = new Date();
  await this.save();
  return this;
};

// Method to end session
sessionSchema.methods.endSession = async function () {
  this.status = 'completed';
  this.endedAt = new Date();
  this.qrCode.isActive = false;
  await this.save();
  return this;
};

// Method to cancel session
sessionSchema.methods.cancelSession = async function (reason) {
  this.status = 'cancelled';
  this.description = (this.description || '') + '\n\nCancelled: ' + reason;
  await this.save();
  return this;
};

// Method to update metadata
sessionSchema.methods.updateMetadata = async function (stats) {
  this.metadata = {
    ...this.metadata,
    ...stats,
  };
  await this.save();
  return this;
};

// Static method to find active sessions for a course
sessionSchema.statics.findActiveByCourse = function (courseId) {
  return this.find({
    course: courseId,
    status: 'active',
    date: { $lte: new Date() },
  }).sort({ startTime: 1 });
};

// Static method to find upcoming sessions
sessionSchema.statics.findUpcoming = function (options = {}) {
  const query = {
    status: 'scheduled',
    date: { $gte: new Date() },
  };

  if (options.courseId) query.course = options.courseId;
  if (options.facultyId) query.faculty = options.facultyId;
  if (options.studentId) {
    // Find courses student is enrolled in
    const Enrollment = mongoose.model('Enrollment');
    return Enrollment.find({ student: options.studentId, status: 'active' }).populate({
      path: 'course',
      populate: {
        path: 'sessions',
        match: query,
      },
    });
  }

  return this.find(query)
    .populate('course', 'code name')
    .populate('faculty', 'firstName lastName')
    .sort({ date: 1, startTime: 1 });
};

// Static method to find sessions by date range
sessionSchema.statics.findByDateRange = function (startDate, endDate, options = {}) {
  const query = {
    date: { $gte: startDate, $lte: endDate },
  };

  if (options.courseId) query.course = options.courseId;
  if (options.facultyId) query.faculty = options.facultyId;
  if (options.status) query.status = options.status;

  return this.find(query)
    .populate('course', 'code name')
    .populate('faculty', 'firstName lastName')
    .sort({ date: 1, startTime: 1 });
};

// Static method to get faculty schedule
sessionSchema.statics.getFacultySchedule = function (facultyId, startDate, endDate) {
  return this.find({
    faculty: facultyId,
    date: { $gte: startDate, $lte: endDate },
    status: { $ne: 'cancelled' },
  })
    .populate('course', 'code name')
    .sort({ date: 1, startTime: 1 });
};

// Static method to get today's sessions (optionally for a specific faculty)
sessionSchema.statics.getTodaysSessions = function (facultyId) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);

  const query = {
    date: { $gte: start, $lt: end },
    status: { $in: ['scheduled', 'active'] },
  };
  if (facultyId) query.faculty = facultyId;

  return this.find(query)
    .populate('course', 'code name')
    .populate('faculty', 'firstName lastName')
    .sort({ startTime: 1 });
};

// ── Rotating QR token (anti-screenshot) ────────────────────────────────────
// The static per-session token above stays valid for backward compatibility,
// but an active session also carries a SHORT-LIVED rotating token that changes
// every ROTATION_SECONDS. The faculty display auto-refreshes; a screenshotted
// QR shared to an absent friend is useless once the step rolls over.
const ROTATION_SECONDS = parseInt(process.env.QR_ROTATION_SECONDS, 10) || 30;

// Current time-step index (integer that increments every ROTATION_SECONDS).
function currentStep(atMs = Date.now()) {
  return Math.floor(atMs / 1000 / ROTATION_SECONDS);
}

// Deterministic rolling token for a given step, bound to this specific session
// and the server secret. Not guessable without QR_CODE_SECRET.
sessionSchema.methods.rotatingTokenForStep = function (step) {
  const secret = process.env.QR_CODE_SECRET;
  if (!secret) throw new Error('QR_CODE_SECRET is not configured');
  return crypto
    .createHmac('sha256', secret)
    .update(`${this._id.toString()}:${this.course.toString()}:${step}`)
    .digest('hex')
    .substring(0, 16);
};

// Token for the current step, plus when it expires (start of next step).
sessionSchema.methods.getRotatingToken = function () {
  const step = currentStep();
  return {
    rt: this.rotatingTokenForStep(step),
    rotationSeconds: ROTATION_SECONDS,
    // ms until this token rolls over — lets the client schedule a refresh.
    expiresInMs: (step + 1) * ROTATION_SECONDS * 1000 - Date.now(),
  };
};

// Validate a rotating token allowing ±1 step of clock skew / scan latency
// (i.e. a token is accepted for up to ~2×ROTATION_SECONDS).
sessionSchema.methods.validateRotatingToken = function (rt) {
  if (!rt || typeof rt !== 'string') return false;
  const step = currentStep();
  for (const s of [step, step - 1, step + 1]) {
    // constant-time compare to avoid timing leaks
    const expected = this.rotatingTokenForStep(s);
    if (expected.length === rt.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(rt))) {
      return true;
    }
  }
  return false;
};

const Session = mongoose.model('Session', sessionSchema);

export default Session;
