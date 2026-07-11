import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email'],
    },
    passwordHash: {
      type: String,
      required: [true, 'Password is required'],
      minlength: 8,
      select: false,
    },
    role: {
      type: String,
      enum: ['admin', 'faculty', 'student'],
      required: [true, 'Role is required'],
    },
    firstName: {
      type: String,
      required: [true, 'First name is required'],
      trim: true,
      maxlength: 50,
    },
    lastName: {
      type: String,
      required: [true, 'Last name is required'],
      trim: true,
      maxlength: 50,
    },
    phone: {
      type: String,
      trim: true,
      match: [/^\+?[(]?[0-9]{3}[)]?[-\s.]?[0-9]{3}[-\s.]?[0-9]{4,6}$/, 'Invalid phone number'],
    },
    avatar: {
      type: String,
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastLogin: {
      type: Date,
      default: null,
    },
    refreshToken: {
      type: String,
      select: false,
      default: null,
    },
    passwordResetToken: {
      type: String,
      select: false,
      default: null,
    },
    passwordResetExpires: {
      type: Date,
      select: false,
      default: null,
    },

    // Faculty-specific fields
    employeeId: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
      uppercase: true,
    },
    department: {
      type: String,
      trim: true,
    },
    designation: {
      type: String,
      trim: true,
    },

    // Student-specific fields
    studentId: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
      uppercase: true,
    },
    program: {
      type: String,
      trim: true,
    },
    year: {
      type: Number,
      min: 1,
      max: 6,
    },
    semester: {
      type: Number,
      min: 1,
      max: 12,
    },
    rollNumber: {
      type: String,
      trim: true,
      uppercase: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes
userSchema.index({ role: 1 });
userSchema.index({ isActive: 1 });
userSchema.index({ department: 1 });
userSchema.index({ program: 1, year: 1, semester: 1 });

// Virtual for full name
userSchema.virtual('fullName').get(function () {
  return `${this.firstName} ${this.lastName}`;
});

// Virtual for attendance (populated)
userSchema.virtual('attendanceRecords', {
  ref: 'Attendance',
  localField: '_id',
  foreignField: 'student',
});

// Pre-save middleware to hash password
userSchema.pre('save', async function (next) {
  if (!this.isModified('passwordHash')) return next();

  const saltRounds = parseInt(process.env.BCRYPT_SALT_ROUNDS) || 12;
  this.passwordHash = await bcrypt.hash(this.passwordHash, saltRounds);
  next();
});

// Instance method to compare password
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.passwordHash);
};

// Instance method to generate password reset token
userSchema.methods.generatePasswordResetToken = function () {
  const resetToken = crypto.randomBytes(32).toString('hex');
  this.passwordResetToken = crypto.createHash('sha256').update(resetToken).digest('hex');
  this.passwordResetExpires = Date.now() + 10 * 60 * 1000; // 10 minutes
  return resetToken;
};

// Static method to find by email with password
userSchema.statics.findByEmailWithPassword = function (email) {
  return this.findOne({ email }).select('+passwordHash');
};

// Static method to find active users
userSchema.statics.findActive = function () {
  return this.find({ isActive: true });
};

const User = mongoose.model('User', userSchema);

export default User;
