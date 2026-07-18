import mongoose from 'mongoose';

/**
 * AttendanceCorrection — a student-initiated dispute over an attendance record
 * (or a missing one). Faculty/admin approve or reject; on approval the linked
 * attendance record is updated and every state change is auditable.
 */
const attendanceCorrectionSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Student is required'],
      index: true,
    },
    session: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Session',
      required: [true, 'Session is required'],
      index: true,
    },
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Course',
      required: [true, 'Course is required'],
    },
    faculty: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Faculty is required'],
      index: true,
    },
    // The existing attendance record in dispute (null if the student claims
    // they were never marked at all).
    attendance: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Attendance',
      default: null,
    },
    // What the student is asking to be changed to.
    requestedStatus: {
      type: String,
      enum: ['present', 'late', 'excused'],
      required: [true, 'Requested status is required'],
    },
    reason: {
      type: String,
      required: [true, 'A reason is required'],
      trim: true,
      minlength: 5,
      maxlength: 1000,
    },
    // Optional evidence link (doctor's note, screenshot, etc.).
    evidenceUrl: {
      type: String,
      trim: true,
      default: null,
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
      index: true,
    },
    resolvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    resolvedAt: {
      type: Date,
      default: null,
    },
    resolutionNote: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// A student may only have ONE pending correction per session at a time.
attendanceCorrectionSchema.index(
  { student: 1, session: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: 'pending' } }
);
attendanceCorrectionSchema.index({ faculty: 1, status: 1, createdAt: -1 });

const AttendanceCorrection = mongoose.model(
  'AttendanceCorrection',
  attendanceCorrectionSchema
);

export default AttendanceCorrection;
