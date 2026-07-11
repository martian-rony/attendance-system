import mongoose from 'mongoose';

const enrollmentSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Student is required'],
    },
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Course',
      required: [true, 'Course is required'],
    },
    enrolledAt: {
      type: Date,
      default: Date.now,
    },
    enrolledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    status: {
      type: String,
      enum: ['active', 'dropped', 'completed', 'waitlisted'],
      default: 'active',
    },
    droppedAt: {
      type: Date,
      default: null,
    },
    dropReason: {
      type: String,
      trim: true,
      maxlength: 500,
    },
    grade: {
      type: String,
      trim: true,
      uppercase: true,
      match: [/^[A-F][+-]?$/, 'Invalid grade format'],
    },
    attendanceSummary: {
      totalSessions: { type: Number, default: 0 },
      present: { type: Number, default: 0 },
      absent: { type: Number, default: 0 },
      late: { type: Number, default: 0 },
      excused: { type: Number, default: 0 },
      percentage: { type: Number, default: 100 },
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Compound unique index
enrollmentSchema.index({ student: 1, course: 1 }, { unique: true });
enrollmentSchema.index({ student: 1, status: 1 });
enrollmentSchema.index({ course: 1, status: 1 });
enrollmentSchema.index({ enrolledAt: -1 });

// Virtual for attendance rate
enrollmentSchema.virtual('attendanceRate').get(function () {
  if (this.attendanceSummary.totalSessions === 0) return 100;
  return Math.round((this.attendanceSummary.present / this.attendanceSummary.totalSessions) * 100);
});

// Method to update attendance summary
enrollmentSchema.methods.updateAttendanceSummary = async function () {
  const Attendance = mongoose.model('Attendance');
  const stats = await Attendance.aggregate([
    { $match: { course: this.course, student: this.student } },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
      },
    },
  ]);

  const summary = {
    totalSessions: 0,
    present: 0,
    absent: 0,
    late: 0,
    excused: 0,
    percentage: 100,
  };

  stats.forEach((stat) => {
    summary.totalSessions += stat.count;
    summary[stat._id] = stat.count;
  });

  if (summary.totalSessions > 0) {
    summary.percentage = Math.round((summary.present / summary.totalSessions) * 100);
  }

  this.attendanceSummary = summary;
  await this.save();
  return this;
};

// Method to drop enrollment
enrollmentSchema.methods.drop = async function (reason, droppedBy = null) {
  this.status = 'dropped';
  this.droppedAt = new Date();
  this.dropReason = reason;
  await this.save();

  // Remove from course students array
  await mongoose.model('Course').findByIdAndUpdate(this.course, {
    $pull: { students: this.student },
  });

  return this;
};

// Static method to enroll student
enrollmentSchema.statics.enrollStudent = async function (studentId, courseId, enrolledBy = null) {
  const enrollment = await this.create({
    student: studentId,
    course: courseId,
    enrolledBy,
    status: 'active',
  });

  // Add student to course
  await mongoose.model('Course').findByIdAndUpdate(courseId, {
    $addToSet: { students: studentId },
  });

  return enrollment;
};

// Static method to get student's enrollments
enrollmentSchema.statics.getStudentEnrollments = function (studentId, options = {}) {
  const query = { student: studentId };
  if (options.status) query.status = options.status;
  if (options.activeOnly) query.status = 'active';

  return this.find(query)
    .populate({
      path: 'course',
      populate: { path: 'faculty', select: 'firstName lastName email department' },
    })
    .sort({ enrolledAt: -1 });
};

// Static method to get course enrollments
enrollmentSchema.statics.getCourseEnrollments = function (courseId, options = {}) {
  const query = { course: courseId };
  if (options.status) query.status = options.status;

  return this.find(query)
    .populate('student', 'firstName lastName studentId email avatar program year semester')
    .sort({ enrolledAt: 1 });
};

const Enrollment = mongoose.model('Enrollment', enrollmentSchema);

export default Enrollment;
