import { z } from 'zod';

// Auth validators
export const registerSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email address'),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
      .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
      .regex(/[0-9]/, 'Password must contain at least one number'),
    firstName: z.string().min(1, 'First name is required').max(50),
    lastName: z.string().min(1, 'Last name is required').max(50),
    role: z.enum(['admin', 'faculty', 'student']),
    phone: z.string().optional(),
    // Faculty fields
    employeeId: z.string().optional(),
    department: z.string().optional(),
    designation: z.string().optional(),
    // Student fields
    studentId: z.string().optional(),
    program: z.string().optional(),
    year: z.number().min(1).max(6).optional(),
    semester: z.number().min(1).max(12).optional(),
    rollNumber: z.string().optional(),
  }),
});

export const loginSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(1, 'Password is required'),
    rememberMe: z.boolean().optional(),
  }),
});

export const refreshTokenSchema = z.object({
  body: z.object({
    refreshToken: z.string().optional(),
  }),
});

export const changePasswordSchema = z.object({
  body: z
    .object({
      currentPassword: z.string().min(1, 'Current password is required'),
      newPassword: z
        .string()
        .min(8, 'New password must be at least 8 characters')
        .regex(/[A-Z]/, 'Must contain at least one uppercase letter')
        .regex(/[a-z]/, 'Must contain at least one lowercase letter')
        .regex(/[0-9]/, 'Must contain at least one number'),
      confirmPassword: z.string(),
    })
    .refine((data) => data.newPassword === data.confirmPassword, {
      message: 'Passwords do not match',
      path: ['confirmPassword'],
    }),
});

export const forgotPasswordSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email address'),
  }),
});

export const resetPasswordSchema = z.object({
  body: z
    .object({
      token: z.string().min(1, 'Reset token is required'),
      password: z
        .string()
        .min(8, 'Password must be at least 8 characters')
        .regex(/[A-Z]/, 'Must contain at least one uppercase letter')
        .regex(/[a-z]/, 'Must contain at least one lowercase letter')
        .regex(/[0-9]/, 'Must contain at least one number'),
      confirmPassword: z.string(),
    })
    .refine((data) => data.password === data.confirmPassword, {
      message: 'Passwords do not match',
      path: ['confirmPassword'],
    }),
});

// User validators
export const updateProfileSchema = z.object({
  body: z.object({
    firstName: z.string().min(1).max(50).optional(),
    lastName: z.string().min(1).max(50).optional(),
    phone: z.string().optional(),
    avatar: z.string().url().optional(),
    // Faculty
    department: z.string().optional(),
    designation: z.string().optional(),
    // Student
    program: z.string().optional(),
    year: z.number().min(1).max(6).optional(),
    semester: z.number().min(1).max(12).optional(),
  }),
});

export const updateUserSchema = z.object({
  params: z.object({
    id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid user ID'),
  }),
  body: z.object({
    firstName: z.string().min(1).max(50).optional(),
    lastName: z.string().min(1).max(50).optional(),
    email: z.string().email().optional(),
    role: z.enum(['admin', 'faculty', 'student']).optional(),
    isActive: z.boolean().optional(),
    phone: z.string().optional(),
    department: z.string().optional(),
    designation: z.string().optional(),
    program: z.string().optional(),
    year: z.number().min(1).max(6).optional(),
    semester: z.number().min(1).max(12).optional(),
    rollNumber: z.string().optional(),
  }),
});

// Course validators
export const createCourseSchema = z.object({
  body: z.object({
    code: z.string().regex(/^[A-Z]{2,4}[0-9]{3,4}$/, 'Invalid course code format (e.g., CS101)'),
    name: z.string().min(1, 'Course name is required').max(200),
    description: z.string().max(2000).optional(),
    credits: z.number().min(1).max(6).default(3),
    department: z.string().min(1, 'Department is required').max(100),
    semester: z.number().min(1).max(12),
    academicYear: z
      .string()
      .regex(/^\d{4}-\d{4}$/, 'Format: YYYY-YYYY')
      .optional(),
    faculty: z
      .string()
      .regex(/^[0-9a-fA-F]{24}$/, 'Invalid faculty ID')
      .optional(),
    schedule: z
      .array(
        z.object({
          day: z.enum([
            'monday',
            'tuesday',
            'wednesday',
            'thursday',
            'friday',
            'saturday',
            'sunday',
          ]),
          startTime: z
            .string()
            .regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format (HH:MM)'),
          endTime: z
            .string()
            .regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format (HH:MM)'),
          room: z.string().max(50).optional(),
        })
      )
      .optional(),
    location: z
      .object({
        coordinates: z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]),
      })
      .optional(),
    geofenceRadius: z.number().min(10).max(1000).default(100),
    settings: z
      .object({
        allowLateEntry: z.boolean().default(true),
        lateThreshold: z.number().min(1).max(60).default(15),
        requireGeolocation: z.boolean().default(true),
        attendanceWindowOpenBefore: z.number().min(0).max(60).default(10),
        attendanceWindowCloseAfter: z.number().min(0).max(120).default(30),
      })
      .optional(),
  }),
});

export const updateCourseSchema = z.object({
  params: z.object({
    id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid course ID'),
  }),
  body: z.object({
    name: z.string().min(1).max(200).optional(),
    description: z.string().max(2000).optional(),
    credits: z.number().min(1).max(6).optional(),
    department: z.string().max(100).optional(),
    schedule: z
      .array(
        z.object({
          day: z.enum([
            'monday',
            'tuesday',
            'wednesday',
            'thursday',
            'friday',
            'saturday',
            'sunday',
          ]),
          startTime: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/),
          endTime: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/),
          room: z.string().max(50).optional(),
        })
      )
      .optional(),
    location: z
      .object({
        coordinates: z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]),
      })
      .optional(),
    geofenceRadius: z.number().min(10).max(1000).optional(),
    isActive: z.boolean().optional(),
    settings: z
      .object({
        allowLateEntry: z.boolean().optional(),
        lateThreshold: z.number().min(1).max(60).optional(),
        requireGeolocation: z.boolean().optional(),
        attendanceWindowOpenBefore: z.number().min(0).max(60).optional(),
        attendanceWindowCloseAfter: z.number().min(0).max(120).optional(),
      })
      .optional(),
  }),
});

export const enrollStudentsSchema = z.object({
  params: z.object({
    id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid course ID'),
  }),
  body: z.object({
    studentIds: z
      .array(z.string().regex(/^[0-9a-fA-F]{24}$/))
      .min(1, 'At least one student required'),
  }),
});

// Session validators
export const createSessionSchema = z.object({
  body: z.object({
    courseId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid course ID'),
    title: z.string().min(1, 'Title is required').max(200),
    description: z.string().max(2000).optional(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date format: YYYY-MM-DD'),
    startTime: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Time format: HH:MM'),
    endTime: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Time format: HH:MM'),
    // Absolute UTC instants sent by the client from its local wall-clock.
    // Timezone-stable window; optional for legacy clients that only send date/startTime.
    startDateTime: z.string().datetime({ offset: true }).optional(),
    endDateTime: z.string().datetime({ offset: true }).optional(),
    room: z.string().max(50).optional(),
    location: z
      .object({
        coordinates: z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]),
      })
      .optional(),
    geofenceRadius: z.number().min(10).max(1000).default(100),
    settings: z
      .object({
        allowLateEntry: z.boolean().default(true),
        lateThreshold: z.number().min(1).max(60).default(15),
        requireGeolocation: z.boolean().default(true),
      })
      .optional(),
    attendanceWindow: z
      .object({
        openBefore: z.number().min(0).max(60).default(10),
        closeAfter: z.number().min(0).max(120).default(30),
      })
      .optional(),
  }),
});

export const updateSessionSchema = z.object({
  params: z.object({
    id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid session ID'),
  }),
  body: z.object({
    title: z.string().min(1).max(200).optional(),
    description: z.string().max(2000).optional(),
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    startTime: z
      .string()
      .regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/)
      .optional(),
    endTime: z
      .string()
      .regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/)
      .optional(),
    startDateTime: z.string().datetime({ offset: true }).optional(),
    endDateTime: z.string().datetime({ offset: true }).optional(),
    room: z.string().max(50).optional(),
    location: z
      .object({
        coordinates: z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]),
      })
      .optional(),
    geofenceRadius: z.number().min(10).max(1000).optional(),
    settings: z
      .object({
        allowLateEntry: z.boolean().optional(),
        lateThreshold: z.number().min(1).max(60).optional(),
        requireGeolocation: z.boolean().optional(),
      })
      .optional(),
    attendanceWindow: z
      .object({
        openBefore: z.number().min(0).max(60).optional(),
        closeAfter: z.number().min(0).max(120).optional(),
      })
      .optional(),
    status: z.enum(['scheduled', 'active', 'completed', 'cancelled']).optional(),
  }),
});

// Attendance validators
export const markAttendanceSchema = z.object({
  body: z.object({
    sessionId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid session ID'),
    qrToken: z.string().optional(),
    rotatingToken: z.string().optional(),
    geolocation: z
      .object({
        coordinates: z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]),
        accuracy: z.number().optional(),
        timestamp: z.string().datetime().optional(),
      })
      .optional(),
    deviceInfo: z
      .object({
        userAgent: z.string().optional(),
        ip: z.string().optional(),
        fingerprint: z.string().optional(),
      })
      .optional(),
  }),
});

export const bulkMarkAttendanceSchema = z.object({
  body: z.object({
    sessionId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid session ID'),
    records: z
      .array(
        z.object({
          studentId: z.string().regex(/^[0-9a-fA-F]{24}$/),
          status: z.enum(['present', 'absent', 'late', 'excused', 'left_early']),
          minutesLate: z.number().min(0).optional(),
          reason: z.string().max(500).optional(),
        })
      )
      .min(1, 'At least one record required'),
  }),
});

export const updateAttendanceSchema = z.object({
  params: z.object({
    id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid attendance ID'),
  }),
  body: z.object({
    status: z.enum(['present', 'absent', 'late', 'excused', 'left_early']).optional(),
    minutesLate: z.number().min(0).optional(),
    excuse: z
      .object({
        reason: z.string().max(500),
        documentUrl: z.string().url().optional(),
      })
      .optional(),
  }),
});

// Enrollment validators
export const dropEnrollmentSchema = z.object({
  params: z.object({
    courseId: z.string().regex(/^[0-9a-fA-F]{24}$/),
    studentId: z.string().regex(/^[0-9a-fA-F]{24}$/),
  }),
  body: z.object({
    reason: z.string().max(500).optional(),
  }),
});

// Query validators
export const paginationSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    sort: z.string().optional(),
    order: z.enum(['asc', 'desc']).default('desc'),
  }),
});

export const filterSchema = z.object({
  query: z.object({
    search: z.string().optional(),
    status: z.string().optional(),
    role: z.string().optional(),
    department: z.string().optional(),
    courseId: z.string().optional(),
    facultyId: z.string().optional(),
    studentId: z.string().optional(),
    fromDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    toDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
  }),
});

export const idParamSchema = z.object({
  params: z.object({
    id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid ID format'),
  }),
});

export const createCorrectionSchema = z.object({
  body: z.object({
    sessionId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid session ID'),
    requestedStatus: z.enum(['present', 'late', 'excused']),
    reason: z.string().min(5).max(1000),
    evidenceUrl: z.string().url().optional().or(z.literal('')),
  }),
});

export const resolveCorrectionSchema = z.object({
  body: z.object({
    decision: z.enum(['approved', 'rejected']),
    resolutionNote: z.string().max(1000).optional(),
  }),
});

// Validation middleware factory
export const validate = (schema) => (req, res, next) => {
  const result = schema.safeParse({
    body: req.body,
    query: req.query,
    params: req.params,
  });

  if (!result.success) {
    const errors = result.error.flatten().fieldErrors;
    const message = Object.entries(errors)
      .map(([field, msgs]) => `${field}: ${msgs.join(', ')}`)
      .join('; ');

    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors,
    });
  }

  // Replace request data with validated data
  req.body = result.data.body || req.body;
  req.query = result.data.query || req.query;
  req.params = result.data.params || req.params;

  next();
};
