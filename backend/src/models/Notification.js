import mongoose from 'mongoose';

/**
 * Notification model.
 * A persistent, per-recipient record backing the in-app notification bell.
 * Real-time delivery is handled by the notification service (socket push);
 * this collection is the durable source of truth so unread counts survive
 * reconnects, multiple devices, and server restarts.
 */
const notificationSchema = new mongoose.Schema(
  {
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Recipient is required'],
    },
    type: {
      type: String,
      required: [true, 'Notification type is required'],
      enum: [
        'session_started',
        'session_ending_soon',
        'attendance_marked',
        'attendance_updated',
        'low_attendance_warning',
        'enrollment_added',
        'enrollment_removed',
        'correction_requested',
        'correction_resolved',
        'system',
      ],
      index: true,
    },
    title: {
      type: String,
      required: [true, 'Title is required'],
      trim: true,
      maxlength: 150,
    },
    body: {
      type: String,
      trim: true,
      maxlength: 500,
      default: '',
    },
    // Optional deep-link the frontend can navigate to when the item is clicked.
    link: {
      type: String,
      trim: true,
      default: null,
    },
    // Free-form payload (ids, counts) for the frontend to act on.
    data: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    read: {
      type: Boolean,
      default: false,
      index: true,
    },
    readAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Recipient inbox, newest first.
notificationSchema.index({ recipient: 1, createdAt: -1 });
// Fast unread-count lookups.
notificationSchema.index({ recipient: 1, read: 1 });
// Auto-expire notifications after 60 days to keep the collection bounded.
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 60 });

const Notification = mongoose.model('Notification', notificationSchema);

export default Notification;
