import mongoose from 'mongoose';

const auditLogSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    action: {
      type: String,
      required: [true, 'Action is required'],
      trim: true,
      maxlength: 100,
    },
    resource: {
      type: String,
      required: [true, 'Resource is required'],
      trim: true,
      maxlength: 50,
    },
    resourceId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    details: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    ip: {
      type: String,
      trim: true,
    },
    userAgent: {
      type: String,
      trim: true,
    },
    success: {
      type: Boolean,
      default: true,
    },
    errorMessage: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: { createdAt: 'timestamp', updatedAt: false },
  }
);

// Indexes
auditLogSchema.index({ user: 1, timestamp: -1 });
auditLogSchema.index({ resource: 1, resourceId: 1 });
auditLogSchema.index({ action: 1 });
auditLogSchema.index({ timestamp: -1 });
auditLogSchema.index({ ip: 1 });

// TTL index - auto delete after 1 year (optional)
// auditLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 31536000 });

// Static method to log action
auditLogSchema.statics.log = async function (data) {
  return this.create({
    user: data.user || null,
    action: data.action,
    resource: data.resource,
    resourceId: data.resourceId || null,
    details: data.details || {},
    ip: data.ip || null,
    userAgent: data.userAgent || null,
    success: data.success !== false,
    errorMessage: data.errorMessage || null,
  });
};

// Static method to get logs for a resource
auditLogSchema.statics.getResourceHistory = function (resource, resourceId) {
  return this.find({ resource, resourceId })
    .populate('user', 'firstName lastName email role')
    .sort({ timestamp: -1 });
};

// Static method to get user activity
auditLogSchema.statics.getUserActivity = function (userId, options = {}) {
  const query = { user: userId };
  if (options.action) query.action = options.action;
  if (options.resource) query.resource = options.resource;
  if (options.from || options.to) {
    query.timestamp = {};
    if (options.from) query.timestamp.$gte = options.from;
    if (options.to) query.timestamp.$lte = options.to;
  }
  return this.find(query)
    .sort({ timestamp: -1 })
    .limit(options.limit || 100);
};

const AuditLog = mongoose.model('AuditLog', auditLogSchema);

export default AuditLog;
