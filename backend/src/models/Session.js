import mongoose from 'mongoose';
import crypto from 'crypto';

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

// Virtual for session datetime
sessionSchema.virtual('sessionDateTime').get(function () {
  const [hours, minutes] = this.startTime.split(':');
  // this.date is stored as UTC midnight; read its calendar Y/M/D locally so
  // we don't accidentally shift by the timezone offset when applying startTime.
  const d = new Date(this.date);
  const dt = new Date(
    d.getFullYear(),
    d.getMonth(),
    d.getDate(),
    parseInt(hours),
    parseInt(minutes),
    0,
    0
  );
  return dt;
});

// Virtual for session end datetime
sessionSchema.virtual('sessionEndDateTime').get(function () {
  const [hours, minutes] = this.endTime.split(':');
  const dt = new Date(this.date);
  dt.setHours(parseInt(hours), parseInt(minutes), 0, 0);
  return dt;
});

// Virtual for attendance window open time
sessionSchema.virtual('windowOpenTime').get(function () {
  const openBefore = this.attendanceWindow?.openBefore ?? 10;
  const dt = this.sessionDateTime;
  dt.setMinutes(dt.getMinutes() - openBefore);
  return dt;
});

// Virtual for attendance window close time
sessionSchema.virtual('windowCloseTime').get(function () {
  const closeAfter = this.attendanceWindow?.closeAfter ?? 30;
  const dt = this.sessionDateTime;
  dt.setMinutes(dt.getMinutes() + closeAfter);
  // Never close the window before the class actually ends — for any session
  // longer than `closeAfter` minutes, stay open through the whole period so a
  // student inside the geofence and inside the scheduled time can still mark.
  // If `closeAfter` is larger than the session length, that later time wins.
  const end = this.sessionEndDateTime;
  return end.getTime() > dt.getTime() ? end : dt;
});

// Virtual for is within attendance window
sessionSchema.virtual('isWithinWindow').get(function () {
  const now = new Date();
  return now >= this.windowOpenTime && now <= this.windowCloseTime;
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

const Session = mongoose.model('Session', sessionSchema);

export default Session;
