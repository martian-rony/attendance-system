import mongoose from 'mongoose';

const courseSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: [true, 'Course code is required'],
      unique: true,
      uppercase: true,
      trim: true,
      match: [/^[A-Z]{2,4}\d{3,4}$/, 'Invalid course code format (e.g., CS101)'],
    },
    name: {
      type: String,
      required: [true, 'Course name is required'],
      trim: true,
      maxlength: 200,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 2000,
    },
    credits: {
      type: Number,
      default: 3,
      min: 1,
      max: 6,
    },
    department: {
      type: String,
      required: [true, 'Department is required'],
      trim: true,
    },
    semester: {
      type: Number,
      required: [true, 'Semester is required'],
      min: 1,
      max: 12,
    },
    academicYear: {
      type: String,
      match: [/^\d{4}-\d{4}$/, 'Format: YYYY-YYYY (e.g., 2024-2025)'],
    },
    faculty: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    students: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    schedule: [
      {
        day: {
          type: String,
          enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'],
          required: true,
        },
        startTime: {
          type: String,
          required: true,
          match: [/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format (HH:MM)'],
        },
        endTime: {
          type: String,
          required: true,
          match: [/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format (HH:MM)'],
        },
        room: {
          type: String,
          trim: true,
        },
      },
    ],
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        index: '2dsphere',
        validate: {
          validator: function (v) {
            return v.length === 2 && v[0] >= -180 && v[0] <= 180 && v[1] >= -90 && v[1] <= 90;
          },
          message: 'Invalid coordinates [longitude, latitude]',
        },
      },
    },
    geofenceRadius: {
      type: Number,
      default: 100,
      min: 10,
      max: 1000,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    settings: {
      allowLateEntry: { type: Boolean, default: true },
      lateThreshold: { type: Number, default: 15 },
      requireGeolocation: { type: Boolean, default: true },
      autoMarkAbsent: { type: Boolean, default: true },
      attendanceWindow: {
        openBefore: { type: Number, default: 10 },
        closeAfter: { type: Number, default: 30 },
      },
    },
    totalSessions: {
      type: Number,
      default: 0,
    },
    completedSessions: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes
courseSchema.index({ faculty: 1 });
courseSchema.index({ department: 1, semester: 1, academicYear: 1 });
courseSchema.index({ isActive: 1 });

// Virtual for enrolled students count
courseSchema.virtual('enrolledCount', {
  ref: 'Enrollment',
  localField: '_id',
  foreignField: 'course',
  count: true,
  match: { status: 'active' },
});

// Virtual for attendance rate
courseSchema.virtual('attendanceRate').get(function () {
  if (this.totalSessions === 0) return 100;
  return Math.round((this.completedSessions / this.totalSessions) * 100);
});

// Method to get enrolled students
courseSchema.methods.getEnrolledStudents = function () {
  return this.populate('students', 'firstName lastName studentId email avatar');
};

// Method to add student
courseSchema.methods.addStudent = async function (studentId) {
  if (!this.students.includes(studentId)) {
    this.students.push(studentId);
    await this.save();
  }
  return this;
};

// Method to remove student
courseSchema.methods.removeStudent = async function (studentId) {
  this.students = this.students.filter((id) => !id.equals(studentId));
  await this.save();
  return this;
};

// Static method to find by faculty
courseSchema.statics.findByFaculty = function (facultyId, options = {}) {
  const query = { faculty: facultyId };
  if (options.active !== undefined) query.isActive = options.active;
  return this.find(query).populate('faculty', 'firstName lastName email');
};

// Static method to find by student
courseSchema.statics.findByStudent = function (studentId) {
  return this.find({ students: studentId, isActive: true }).populate(
    'faculty',
    'firstName lastName email department'
  );
};

// Static method to find by department
courseSchema.statics.findByDepartment = function (department, options = {}) {
  const query = { department };
  if (options.semester) query.semester = options.semester;
  if (options.academicYear) query.academicYear = options.academicYear;
  if (options.active !== undefined) query.isActive = options.active;
  return this.find(query).populate('faculty', 'firstName lastName');
};

const Course = mongoose.model('Course', courseSchema);

export default Course;
