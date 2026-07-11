import mongoose from 'mongoose';

const attendanceSchema = new mongoose.Schema(
  {
    session: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Session',
      required: [true, 'Session is required'],
    },
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Course',
      required: [true, 'Course is required'],
    },
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Student is required'],
    },
    faculty: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Faculty is required'],
    },
    status: {
      type: String,
      enum: ['present', 'absent', 'late', 'excused', 'left_early'],
      default: 'absent',
    },
    checkInTime: {
      type: Date,
      default: null,
    },
    checkOutTime: {
      type: Date,
      default: null,
    },
    markedAt: {
      type: Date,
      default: Date.now,
    },
    markedBy: {
      type: String,
      enum: ['student', 'faculty', 'auto', 'admin'],
      default: 'student',
    },
    verification: {
      qrCodeUsed: { type: Boolean, default: false },
      qrToken: { type: String, default: null },
      geolocation: {
        coordinates: {
          type: [Number], // [longitude, latitude]
          validate: {
            validator: function (v) {
              return v.length === 2 && v[0] >= -180 && v[0] <= 180 && v[1] >= -90 && v[1] <= 90;
            },
            message: 'Invalid coordinates [longitude, latitude]',
          },
        },
        accuracy: { type: Number },
        timestamp: { type: Date },
      },
      deviceInfo: {
        userAgent: { type: String },
        ip: { type: String },
        fingerprint: { type: String },
      },
    },
    minutesLate: {
      type: Number,
      default: 0,
      min: 0,
    },
    history: [
      {
        status: {
          type: String,
          enum: ['present', 'absent', 'late', 'excused', 'left_early'],
        },
        changedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
        },
        changedAt: {
          type: Date,
          default: Date.now,
        },
        reason: {
          type: String,
          trim: true,
          maxlength: 500,
        },
      },
    ],
    excuse: {
      isExcused: { type: Boolean, default: false },
      reason: { type: String, trim: true, maxlength: 500 },
      documentUrl: { type: String, trim: true },
      approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      approvedAt: { type: Date },
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Compound unique index - one attendance per student per session
attendanceSchema.index({ session: 1, student: 1 }, { unique: true });
attendanceSchema.index({ course: 1, student: 1 });
attendanceSchema.index({ faculty: 1, markedAt: -1 });
attendanceSchema.index({ student: 1, markedAt: -1 });
attendanceSchema.index({ status: 1 });
attendanceSchema.index({ markedBy: 1 });
attendanceSchema.index({ checkInTime: -1 });

// Virtual for duration
attendanceSchema.virtual('durationMinutes').get(function () {
  if (!this.checkInTime || !this.checkOutTime) return null;
  return Math.round((this.checkOutTime - this.checkInTime) / (1000 * 60));
});

// Virtual for isLate
attendanceSchema.virtual('isLate').get(function () {
  return this.status === 'late' || this.minutesLate > 0;
});

// Pre-save middleware to add history entry on status change
attendanceSchema.pre('save', function (next) {
  if (this.isModified('status') && !this.isNew) {
    this.history.push({
      status: this.status,
      changedBy: this._changedBy || this.faculty,
      reason: this._statusChangeReason || 'Status updated',
    });
  }
  next();
});

// Method to mark attendance
attendanceSchema.methods.markAttendance = function (data) {
  const {
    status = 'present',
    checkInTime = new Date(),
    markedBy = 'student',
    qrToken = null,
    geolocation = null,
    deviceInfo = null,
    minutesLate = 0,
    changedBy = null,
    reason = 'Marked via ' + markedBy,
  } = data;

  this.status = status;
  this.checkInTime = checkInTime;
  this.markedBy = markedBy;
  this.minutesLate = minutesLate;
  this.markedAt = new Date();

  if (qrToken) {
    this.verification.qrCodeUsed = true;
    this.verification.qrToken = qrToken;
  }

  if (geolocation?.coordinates) {
    this.verification.geolocation = {
      coordinates: geolocation.coordinates,
      accuracy: geolocation.accuracy,
      timestamp: geolocation.timestamp || new Date(),
    };
  }

  if (deviceInfo) {
    this.verification.deviceInfo = deviceInfo;
  }

  // Add to history
  this.history.push({
    status,
    changedBy: changedBy || this.faculty,
    reason,
  });

  this._changedBy = changedBy;
  this._statusChangeReason = reason;

  return this.save();
};

// Method to check out
attendanceSchema.methods.checkOut = function (checkOutTime = new Date()) {
  this.checkOutTime = checkOutTime;
  return this.save();
};

// Method to update status (faculty/admin)
attendanceSchema.methods.updateStatus = async function (newStatus, changedBy, reason) {
  const oldStatus = this.status;
  this.status = newStatus;
  this._changedBy = changedBy;
  this._statusChangeReason = reason || `Changed from ${oldStatus} to ${newStatus}`;

  if (newStatus === 'excused') {
    this.excuse.isExcused = true;
    this.excuse.reason = reason;
    this.excuse.approvedBy = changedBy;
    this.excuse.approvedAt = new Date();
  }

  await this.save();

  // Update enrollment summary
  await mongoose
    .model('Enrollment')
    .findOneAndUpdate(
      { student: this.student, course: this.course },
      { $inc: { [`attendanceSummary.${oldStatus}`]: -1, [`attendanceSummary.${newStatus}`]: 1 } }
    );

  return this;
};

// Method to excuse absence
attendanceSchema.methods.markExcused = async function (reason, documentUrl, approvedBy) {
  this.excuse = {
    isExcused: true,
    reason,
    documentUrl,
    approvedBy,
    approvedAt: new Date(),
  };
  this.status = 'excused';
  await this.save();
  return this;
};

// Static method to get student attendance for a course
attendanceSchema.statics.getStudentCourseAttendance = function (studentId, courseId) {
  return this.find({ student: studentId, course: courseId })
    .populate('session', 'date startTime endTime title status')
    .sort({ markedAt: -1 });
};

// Static method to get session attendance
attendanceSchema.statics.getSessionAttendance = function (sessionId, options = {}) {
  const query = { session: sessionId };
  if (options.status) query.status = options.status;

  return this.find(query)
    .populate('student', 'firstName lastName studentId email avatar')
    .sort({ student: 1 });
};

// Static method to get attendance stats for a course
attendanceSchema.statics.getCourseStats = async function (courseId) {
  const stats = await this.aggregate([
    { $match: { course: new mongoose.Types.ObjectId(courseId) } },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
      },
    },
  ]);

  const result = {
    total: 0,
    present: 0,
    absent: 0,
    late: 0,
    excused: 0,
    left_early: 0,
    percentage: 0,
  };

  stats.forEach((stat) => {
    result.total += stat.count;
    result[stat._id] = stat.count;
  });

  if (result.total > 0) {
    result.percentage = Math.round(((result.present + result.late) / result.total) * 100);
  }

  return result;
};

// Static method to get student stats across all courses
attendanceSchema.statics.getStudentStats = async function (studentId, options = {}) {
  const match = { student: new mongoose.Types.ObjectId(studentId) };
  if (options.courseId) match.course = new mongoose.Types.ObjectId(options.courseId);

  const stats = await this.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$course',
        total: { $sum: 1 },
        present: { $sum: { $cond: [{ $eq: ['$status', 'present'] }, 1, 0] } },
        absent: { $sum: { $cond: [{ $eq: ['$status', 'absent'] }, 1, 0] } },
        late: { $sum: { $cond: [{ $eq: ['$status', 'late'] }, 1, 0] } },
        excused: { $sum: { $cond: [{ $eq: ['$status', 'excused'] }, 1, 0] } },
      },
    },
    {
      $lookup: {
        from: 'courses',
        localField: '_id',
        foreignField: '_id',
        as: 'course',
      },
    },
    { $unwind: '$course' },
    {
      $project: {
        courseCode: '$course.code',
        courseName: '$course.name',
        total: 1,
        present: 1,
        absent: 1,
        late: 1,
        excused: 1,
        percentage: {
          $multiply: [{ $divide: [{ $add: ['$present', '$late'] }, '$total'] }, 100],
        },
      },
    },
    { $sort: { courseCode: 1 } },
  ]);

  return stats.map((s) => ({
    ...s,
    percentage: Math.round(s.percentage),
  }));
};

// Static method to get a single student's overall attendance summary.
// Returns a rollup: total + breakdowns + percentage, optionally scoped to one
// course. The /api/attendance/summary controller depends on this existing.
attendanceSchema.statics.getStudentSummary = async function (studentId, courseId) {
  const match = { student: new mongoose.Types.ObjectId(studentId) };
  if (courseId) match.course = new mongoose.Types.ObjectId(courseId);

  const [stats, byCourse] = await Promise.all([
    this.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          present: { $sum: { $cond: [{ $eq: ['$status', 'present'] }, 1, 0] } },
          absent: { $sum: { $cond: [{ $eq: ['$status', 'absent'] }, 1, 0] } },
          late: { $sum: { $cond: [{ $eq: ['$status', 'late'] }, 1, 0] } },
          excused: { $sum: { $cond: [{ $eq: ['$status', 'excused'] }, 1, 0] } },
          left_early: { $sum: { $cond: [{ $eq: ['$status', 'left_early'] }, 1, 0] } },
        },
      },
    ]),
    this.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$course',
          total: { $sum: 1 },
          present: { $sum: { $cond: [{ $eq: ['$status', 'present'] }, 1, 0] } },
          late: { $sum: { $cond: [{ $eq: ['$status', 'late'] }, 1, 0] } },
        },
      },
      { $lookup: { from: 'courses', localField: '_id', foreignField: '_id', as: 'course' } },
      { $unwind: { path: '$course', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          courseId: '$_id',
          courseCode: '$course.code',
          courseName: '$course.name',
          total: 1,
          present: 1,
          late: 1,
          percentage: {
            $cond: [
              { $gt: ['$total', 0] },
              { $round: [{ $multiply: [{ $divide: [{ $add: ['$present', '$late'] }, '$total'] }, 100] }, 0] },
              0,
            ],
          },
        },
      },
      { $sort: { courseCode: 1 } },
    ]),
  ]);

  const agg = stats[0] || {
    total: 0, present: 0, absent: 0, late: 0, excused: 0, left_early: 0,
  };
  const percentage =
    agg.total > 0
      ? Math.round(((agg.present + agg.late) / agg.total) * 100)
      : 0;

  return {
    total: agg.total,
    present: agg.present,
    absent: agg.absent,
    late: agg.late,
    excused: agg.excused,
    left_early: agg.left_early,
    percentage,
    byCourse,
  };
};

// Static method to mark bulk attendance
attendanceSchema.statics.bulkMarkAttendance = async function (attendanceData) {
  const operations = attendanceData.map((data) => ({
    updateOne: {
      filter: { session: data.sessionId, student: data.studentId },
      update: {
        $set: {
          status: data.status,
          checkInTime: data.checkInTime || new Date(),
          markedBy: data.markedBy || 'faculty',
          minutesLate: data.minutesLate || 0,
          'verification.qrCodeUsed': data.qrToken ? true : false,
          'verification.qrToken': data.qrToken || null,
        },
        $push: {
          history: {
            status: data.status,
            changedBy: data.changedBy || data.facultyId,
            reason: data.reason || 'Bulk marked by faculty',
          },
        },
      },
      upsert: true,
    },
  }));

  return this.bulkWrite(operations);
};

// Static method to get low attendance students
attendanceSchema.statics.getLowAttendanceStudents = async function (threshold = 75, options = {}) {
  const match = {};
  if (options.courseId) match.course = new mongoose.Types.ObjectId(options.courseId);
  if (options.facultyId) match.faculty = new mongoose.Types.ObjectId(options.facultyId);

  return this.aggregate([
    { $match: match },
    {
      $group: {
        _id: { student: '$student', course: '$course' },
        total: { $sum: 1 },
        present: { $sum: { $cond: [{ $in: ['$status', ['present', 'late']] }, 1, 0] } },
        late: { $sum: { $cond: [{ $eq: ['$status', 'late'] }, 1, 0] } },
        excused: { $sum: { $cond: [{ $eq: ['$status', 'excused'] }, 1, 0] } },
      },
    },
    {
      $addFields: {
        percentage: {
          $multiply: [{ $divide: ['$present', '$total'] }, 100],
        },
      },
    },
    { $match: { percentage: { $lt: threshold } } },
    {
      $lookup: {
        from: 'users',
        localField: '_id.student',
        foreignField: '_id',
        as: 'student',
      },
    },
    { $unwind: '$student' },
    {
      $lookup: {
        from: 'courses',
        localField: '_id.course',
        foreignField: '_id',
        as: 'course',
      },
    },
    { $unwind: '$course' },
    {
      $project: {
        studentId: '$student._id',
        studentName: { $concat: ['$student.firstName', ' ', '$student.lastName'] },
        studentEmail: '$student.email',
        studentIdNumber: '$student.studentId',
        courseCode: '$course.code',
        courseName: '$course.name',
        total: 1,
        present: 1,
        late: 1,
        excused: 1,
        percentage: { $round: ['$percentage', 2] },
      },
    },
    { $sort: { percentage: 1 } },
  ]);
};

const Attendance = mongoose.model('Attendance', attendanceSchema);

export default Attendance;
