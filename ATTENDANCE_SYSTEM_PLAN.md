# Online Attendance Management System - MERN Stack Implementation Plan

## Project Overview
A comprehensive full-stack attendance management system built with the MERN stack (MongoDB, Express.js, React, Node.js) featuring role-based access control, QR code-based attendance marking, geolocation verification, real-time updates, and comprehensive reporting.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        ONLINE ATTENDANCE MANAGEMENT SYSTEM                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────┐  │
│  │   ADMIN      │    │  FACULTY     │    │  STUDENT     │    │  REAL-   │  │
│  │  DASHBOARD   │    │  DASHBOARD   │    │  DASHBOARD   │    │  TIME    │  │
│  │  (React)     │    │  (React)     │    │  (React)     │    │  (Socket)│  │
│  └──────┬───────┘    └──────┬───────┘    └──────┬───────┘    └────┬─────┘  │
│         │                   │                   │                 │        │
│         └───────────────────┼───────────────────┼─────────────────┘        │
│                             ▼                   ▼                          │
│                    ┌─────────────────────────────────────┐                 │
│                    │         REACT FRONTEND (Vite)        │                 │
│                    │  • Tailwind CSS + shadcn/ui          │                 │
│                    │  • React Router v6 + Context API     │                 │
│                    │  • QR Scanner (html5-qrcode)         │                 │
│                    │  • Socket.io Client                  │                 │
│                    └─────────────────┬────────────────────┘                 │
│                                      │                                      │
│                                      ▼                                      │
│                    ┌─────────────────────────────────────┐                 │
│                    │      EXPRESS.JS BACKEND API          │                 │
│                    │  • JWT Authentication + RBAC        │                 │
│                    │  • RESTful API + Socket.io          │                 │
│                    │  • Mongoose ODM + MongoDB           │                 │
│                    │  • QR Code Generation (qrcode)      │                 │
│                    │  • Geolocation Validation           │                 │
│                    └─────────────────┬────────────────────┘                 │
│                                      │                                      │
│                                      ▼                                      │
│                    ┌─────────────────────────────────────┐                 │
│                    │         MONGODB DATABASE             │                 │
│                    │  • Users (Admin, Faculty, Student)  │                 │
│                    │  • Courses & Enrollments            │                 │
│                    │  • Sessions & QR Codes              │                 │
│                    │  • Attendance Records               │                 │
│                    │  • Audit Logs                       │                 │
│                    └─────────────────────────────────────┘                 │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Tech Stack

### Backend
- **Runtime**: Node.js 20+ (LTS)
- **Framework**: Express.js 4.x
- **Database**: MongoDB 7+ with Mongoose 8.x ODM
- **Authentication**: JWT (jsonwebtoken) + bcryptjs
- **Real-time**: Socket.io 4.x
- **QR Codes**: qrcode + qrcode-reader
- **Validation**: Zod / Joi
- **Environment**: dotenv
- **Logging**: winston / morgan
- **Testing**: Jest + Supertest

### Frontend
- **Framework**: React 18+ with Vite 5+
- **Styling**: Tailwind CSS 3.x + shadcn/ui components
- **Routing**: React Router v6
- **State**: Context API + React Query (TanStack Query) v5
- **Forms**: React Hook Form + Zod validation
- **QR Scanner**: html5-qrcode
- **Charts**: Recharts / Chart.js
- **Real-time**: Socket.io Client
- **Date Handling**: date-fns
- **Icons**: Lucide React
- **Testing**: Vitest + React Testing Library

### DevOps & Tools
- **Package Manager**: npm / pnpm
- **Linting**: ESLint + Prettier
- **Git Hooks**: Husky + lint-staged
- **Containerization**: Docker + Docker Compose
- **CI/CD**: GitHub Actions

---

## Database Schema (MongoDB/Mongoose)

### 1. User Model
```javascript
{
  _id: ObjectId,
  email: { type: String, unique: true, required: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ['admin', 'faculty', 'student'], required: true },
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  phone: { type: String },
  avatar: { type: String }, // Cloudinary URL or local path
  isActive: { type: Boolean, default: true },
  lastLogin: { type: Date },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  
  // Role-specific fields
  // Faculty
  employeeId: { type: String, unique: true, sparse: true },
  department: { type: String },
  designation: { type: String },
  
  // Student
  studentId: { type: String, unique: true, sparse: true },
  program: { type: String },
  year: { type: Number },
  semester: { type: Number },
  rollNumber: { type: String }
}
```

### 2. Course Model
```javascript
{
  _id: ObjectId,
  code: { type: String, unique: true, required: true }, // e.g., "CS101"
  name: { type: String, required: true },
  description: { type: String },
  credits: { type: Number, default: 3 },
  department: { type: String, required: true },
  semester: { type: Number, required: true },
  academicYear: { type: String, required: true }, // e.g., "2024-2025"
  faculty: { type: ObjectId, ref: 'User', required: true },
  students: [{ type: ObjectId, ref: 'User' }],
  schedule: [{
    day: { type: String, enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] },
    startTime: { type: String }, // "09:00"
    endTime: { type: String },   // "10:30"
    room: { type: String }
  }],
  location: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], index: '2dsphere' } // [longitude, latitude]
  },
  geofenceRadius: { type: Number, default: 100 }, // meters
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}
```

### 3. Session Model
```javascript
{
  _id: ObjectId,
  course: { type: ObjectId, ref: 'Course', required: true },
  faculty: { type: ObjectId, ref: 'User', required: true },
  title: { type: String, required: true },
  description: { type: String },
  date: { type: Date, required: true },
  startTime: { type: String, required: true }, // "09:00"
  endTime: { type: String, required: true },   // "10:30"
  room: { type: String },
  
  // QR Code Configuration
  qrCode: {
    data: { type: String }, // Encrypted session token
    imageUrl: { type: String }, // Base64 or cloud URL
    expiresAt: { type: Date },
    isActive: { type: Boolean, default: true }
  },
  
  // Attendance Window
  attendanceWindow: {
    openBefore: { type: Number, default: 10 }, // minutes before start
    closeAfter: { type: Number, default: 30 }  // minutes after start
  },
  
  // Geolocation
  location: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], index: '2dsphere' }
  },
  geofenceRadius: { type: Number, default: 100 },
  
  // Settings
  allowLateEntry: { type: Boolean, default: true },
  lateThreshold: { type: Number, default: 15 }, // minutes
  requireGeolocation: { type: Boolean, default: true },
  requireFaceVerification: { type: Boolean, default: false },
  
  status: { type: String, enum: ['scheduled', 'active', 'completed', 'cancelled'], default: 'scheduled' },
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}
```

### 4. Attendance Model
```javascript
{
  _id: ObjectId,
  session: { type: ObjectId, ref: 'Session', required: true },
  course: { type: ObjectId, ref: 'Course', required: true },
  student: { type: ObjectId, ref: 'User', required: true },
  faculty: { type: ObjectId, ref: 'User', required: true },
  
  // Attendance Status
  status: { 
    type: String, 
    enum: ['present', 'absent', 'late', 'excused', 'left_early'], 
    default: 'absent' 
  },
  
  // Check-in Details
  checkInTime: { type: Date },
  checkOutTime: { type: Date },
  markedAt: { type: Date, default: Date.now },
  markedBy: { 
    type: String, 
    enum: ['student', 'faculty', 'auto', 'admin'], 
    default: 'student' 
  },
  
  // Verification Data
  verification: {
    qrCodeUsed: { type: Boolean, default: false },
    qrToken: { type: String },
    geolocation: {
      coordinates: { type: [Number] }, // [longitude, latitude]
      accuracy: { type: Number },
      timestamp: { type: Date }
    },
    faceVerified: { type: Boolean, default: false },
    deviceInfo: {
      userAgent: { type: String },
      ip: { type: String },
      fingerprint: { type: String }
    }
  },
  
  // Late Entry Calculation
  minutesLate: { type: Number, default: 0 },
  
  // Status History (for audit trail)
  history: [{
    status: { type: String, enum: ['present', 'absent', 'late', 'excused', 'left_early'] },
    changedBy: { type: ObjectId, ref: 'User' },
    changedAt: { type: Date, default: Date.now },
    reason: { type: String }
  }],
  
  // Excuse/Leave Info
  excuse: {
    isExcused: { type: Boolean, default: false },
    reason: { type: String },
    documentUrl: { type: String },
    approvedBy: { type: ObjectId, ref: 'User' },
    approvedAt: { type: Date }
  },
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}

// Compound Indexes
Attendance.index({ session: 1, student: 1 }, { unique: true });
Attendance.index({ course: 1, student: 1 });
Attendance.index({ faculty: 1, date: -1 });
```

### 5. Enrollment Model
```javascript
{
  _id: ObjectId,
  student: { type: ObjectId, ref: 'User', required: true },
  course: { type: ObjectId, ref: 'Course', required: true },
  enrolledAt: { type: Date, default: Date.now },
  enrolledBy: { type: ObjectId, ref: 'User' }, // admin who enrolled
  status: { type: String, enum: ['active', 'dropped', 'completed'], default: 'active' },
  droppedAt: { type: Date },
  dropReason: { type: String }
}

// Compound Index
Enrollment.index({ student: 1, course: 1 }, { unique: true });
```

### 6. AuditLog Model
```javascript
{
  _id: ObjectId,
  user: { type: ObjectId, ref: 'User' },
  action: { type: String, required: true }, // e.g., 'CREATE_SESSION', 'MARK_ATTENDANCE', 'LOGIN'
  resource: { type: String }, // 'Session', 'Attendance', 'User', 'Course'
  resourceId: { type: ObjectId },
  details: { type: Object }, // flexible metadata
  ip: { type: String },
  userAgent: { type: String },
  timestamp: { type: Date, default: Date.now }
}
```

---

## API Endpoints

### Authentication
```
POST   /api/auth/register          # Admin only - create faculty/student
POST   /api/auth/login             # Login - returns JWT + refresh token
POST   /api/auth/refresh           # Refresh access token
POST   /api/auth/logout            # Logout (blacklist refresh token)
GET    /api/auth/me                # Get current user profile
PUT    /api/auth/me                # Update profile
PUT    /api/auth/change-password   # Change password
POST   /api/auth/forgot-password   # Request password reset
POST   /api/auth/reset-password    # Reset password with token
```

### Users (Admin)
```
GET    /api/users                  # List all users (paginated, filterable)
GET    /api/users/:id              # Get user by ID
POST   /api/users                  # Create user (admin only)
PUT    /api/users/:id              # Update user
DELETE /api/users/:id              # Deactivate user
GET    /api/users/faculty          # List all faculty
GET    /api/users/students         # List all students
GET    /api/users/:id/attendance   # Get user's attendance summary
```

### Courses
```
GET    /api/courses                # List courses (paginated, filterable)
GET    /api/courses/:id            # Get course details
POST   /api/courses                # Create course (admin/faculty)
PUT    /api/courses/:id            # Update course
DELETE /api/courses/:id            # Delete course (admin)
POST   /api/courses/:id/enroll     # Enroll students (admin/faculty)
DELETE /api/courses/:id/enroll/:studentId  # Remove student
GET    /api/courses/:id/students   # List enrolled students
GET    /api/courses/:id/sessions   # List course sessions
GET    /api/courses/:id/attendance-report  # Attendance report
GET    /api/courses/my-courses     # Faculty: my courses / Student: enrolled courses
```

### Sessions
```
GET    /api/sessions               # List sessions (filterable)
GET    /api/sessions/:id           # Get session details
POST   /api/sessions               # Create session (faculty)
PUT    /api/sessions/:id           # Update session
DELETE /api/sessions/:id           # Delete/Cancel session
POST   /api/sessions/:id/start     # Start session (generate QR)
POST   /api/sessions/:id/end       # End session
GET    /api/sessions/:id/qr        # Get QR code for session
GET    /api/sessions/:id/attendance  # Get attendance for session
GET    /api/sessions/active        # Get currently active sessions
GET    /api/sessions/upcoming      # Get upcoming sessions
```

### Attendance
```
POST   /api/attendance/mark        # Student marks attendance (QR + geo)
POST   /api/attendance/mark-manual # Faculty marks attendance manually
PUT    /api/attendance/:id         # Update attendance (faculty/admin)
GET    /api/attendance/student/:studentId  # Student's attendance history
GET    /api/attendance/course/:courseId    # Course attendance report
GET    /api/attendance/session/:sessionId  # Session attendance list
GET    /api/attendance/summary     # Dashboard summary stats
GET    /api/attendance/export      # Export attendance (CSV/Excel/PDF)
POST   /api/attendance/bulk        # Bulk attendance update
GET    /api/attendance/stats/:courseId  # Attendance statistics
```

### Reports & Analytics
```
GET    /api/reports/overview       # System-wide overview (admin)
GET    /api/reports/faculty/:id    # Faculty performance report
GET    /api/reports/student/:id    # Student attendance report
GET    /api/reports/course/:id     # Course attendance analytics
GET    /api/reports/department/:dept  # Department-wise report
GET    /api/reports/trends         # Attendance trends over time
GET    /api/reports/low-attendance # Students with <75% attendance
```

---

## Frontend Pages & Components

### Page Structure
```
/ (Login)
/register (Admin only)
/forgot-password
/reset-password/:token

/admin
  /dashboard                    # Overview stats, charts, quick actions
  /users                        # User management table
  /users/:id                    # User detail/edit
  /courses                      # Course management
  /courses/:id                  # Course detail
  /sessions                     # All sessions
  /reports                      # System reports
  /reports/attendance           # Attendance reports
  /reports/analytics            # Analytics dashboard
  /settings                     # System settings
  /audit-logs                   # Audit trail

/faculty
  /dashboard                    # My courses, upcoming sessions, quick stats
  /courses                      # My courses list
  /courses/:id                  # Course detail + students
  /courses/:id/sessions         # Session management
  /courses/:id/sessions/new     # Create new session
  /courses/:id/sessions/:sessionId  # Session detail + QR display
  /courses/:id/attendance       # Attendance marking + reports
  /courses/:id/reports          # Course analytics
  /profile                      # Profile settings

/student
  /dashboard                    # Upcoming classes, attendance %, quick actions
  /courses                      # Enrolled courses
  /courses/:id                  # Course detail + attendance history
  /attendance                   # All attendance history
  /attendance/scan              # QR Scanner page
  /attendance/mark/:sessionId   # Mark attendance (with geo)
  /profile                      # Profile + settings
  /notifications                # Notifications
```

### Key Components

#### Shared Components
- `Layout` - Main layout with sidebar/header per role
- `Sidebar` - Role-based navigation
- `Header` - User menu, notifications, logout
- `DataTable` - Reusable table with sorting, filtering, pagination
- `Modal` - Confirmation, forms, details
- `QRCodeDisplay` - Display QR code with timer
- `QRScanner` - Camera-based QR scanner
- `GeoLocationPrompt` - Request location permission
- `AttendanceStatusBadge` - Visual status indicator
- `StatsCard` - Dashboard metric cards
- `ChartWrapper` - Recharts wrapper
- `ExportButton` - CSV/Excel/PDF export

#### Admin Components
- `UserManagementTable` - CRUD for users
- `CourseManagementTable` - CRUD for courses
- `SystemStatsDashboard` - Overview charts
- `AuditLogViewer` - Filterable audit trail

#### Faculty Components
- `SessionCard` - Session display with actions
- `QRCodeModal` - Full-screen QR display with timer
- `AttendanceMarkingTable` - Manual attendance marking
- `StudentAttendanceTable` - Student list with status
- `CourseAnalyticsCharts` - Attendance trends

#### Student Components
- `UpcomingSessionsList` - Today's/this week's classes
- `AttendanceHistoryTable` - Personal attendance record
- `QRScannerView` - Camera scanner with overlay
- `AttendanceSummaryCard` - Percentage + stats
- `CourseProgressChart` - Visual attendance trend

---

## Real-time Features (Socket.io)

### Events
```javascript
// Server -> Client
'session:started'        // { sessionId, courseId, qrCode, expiresAt }
'session:ended'          // { sessionId }
'attendance:marked'      // { sessionId, studentId, status, timestamp }
'attendance:updated'     // { attendanceId, newStatus, updatedBy }
'notification:new'       // { userId, type, message, data }
'stats:updated'          // { courseId, presentCount, absentCount, lateCount }

// Client -> Server
'join:course'            // { courseId } - faculty/student join course room
'join:session'           // { sessionId } - join active session
'leave:session'          // { sessionId }
'mark:attendance'        // { sessionId, qrToken, location }
'request:stats'          // { courseId }
```

### Rooms
- `course:{courseId}` - All enrolled students + faculty
- `session:{sessionId}` - Active session participants
- `user:{userId}` - Personal notifications
- `admin` - Admin broadcasts

---

## Security Considerations

### Authentication & Authorization
- JWT Access Tokens (15 min expiry) + Refresh Tokens (7 days)
- Role-Based Access Control (RBAC) middleware
- Resource-level permissions (faculty can only access their courses)
- Rate limiting on auth endpoints (5 req/min login, 10 req/min register)

### Data Protection
- Password hashing: bcryptjs (12 rounds)
- JWT secrets: 256-bit random strings, rotated periodically
- HTTPS enforced in production
- CORS configured for specific origins
- Helmet.js for security headers
- Input validation with Zod on all endpoints
- MongoDB injection prevention via Mongoose

### Attendance Security
- QR codes: Short-lived (session duration + buffer), signed tokens
- Geolocation: Server-side validation with Haversine formula
- Device fingerprinting for duplicate detection
- Time-window enforcement (server-side)
- Audit logging for all attendance actions

---

## Implementation Phases

### Phase 1: Foundation (Week 1)
- [ ] Project setup (monorepo or separate client/server)
- [ ] MongoDB connection + Mongoose models
- [ ] Express server with middleware
- [ ] JWT authentication system
- [ ] Basic user CRUD + role management
- [ ] Environment configuration

### Phase 2: Core Backend (Week 2)
- [ ] Course & Enrollment models + APIs
- [ ] Session management + QR code generation
- [ ] Attendance marking API (QR + Geo)
- [ ] Validation middleware (Zod schemas)
- [ ] Error handling + logging
- [ ] Unit tests for core logic

### Phase 3: Frontend Foundation (Week 3)
- [ ] Vite + React + Tailwind + shadcn/ui setup
- [ ] Authentication flow (login, register, protected routes)
- [ ] Role-based routing & layouts
- [ ] API client (Axios + React Query)
- [ ] Shared UI component library

### Phase 4: Role Dashboards (Week 4-5)
- [ ] Admin dashboard + user/course management
- [ ] Faculty dashboard + session management
- [ ] Student dashboard + QR scanner
- [ ] Attendance marking flow (student + faculty)

### Phase 5: Real-time & Reports (Week 6)
- [ ] Socket.io integration
- [ ] Live attendance updates
- [ ] Notification system
- [ ] Reports & analytics (charts, exports)
- [ ] Audit logging

### Phase 6: Polish & Deploy (Week 7)
- [ ] E2E testing (Cypress/Playwright)
- [ ] Performance optimization
- [ ] Docker configuration
- [ ] CI/CD pipeline
- [ ] Documentation (API docs, user guides)
- [ ] Production deployment

---

## File Structure

```
attendance-system/
├── .github/
│   └── workflows/
│       └── ci-cd.yml
├── docker-compose.yml
├── Dockerfile.backend
├── Dockerfile.frontend
├── README.md
├── backend/
│   ├── .env.example
│   ├── .eslintrc.js
│   ├── .prettierrc
│   ├── jest.config.js
│   ├── package.json
│   ├── src/
│   │   ├── app.js                 # Express app setup
│   │   ├── server.js              # Entry point
│   │   ├── config/
│   │   │   ├── database.js        # MongoDB connection
│   │   │   ├── jwt.js             # JWT configuration
│   │   │   ├── socket.js          # Socket.io setup
│   │   │   └── env.js             # Environment validation
│   │   ├── controllers/
│   │   │   ├── authController.js
│   │   │   ├── userController.js
│   │   │   courseController.js
│   │   │   sessionController.js
│   │   │   attendanceController.js
│   │   │   reportController.js
│   │   │   └── notificationController.js
│   │   ├── middlewares/
│   │   │   ├── auth.js            # JWT verification
│   │   │   ├── rbac.js            # Role-based access
│   │   │   ├── validation.js      # Zod validation
│   │   │   ├── rateLimiter.js
│   │   │   ├── errorHandler.js
│   │   │   └── auditLogger.js
│   │   ├── models/
│   │   │   ├── User.js
│   │   │   ├── Course.js
│   │   │   ├── Session.js
│   │   │   ├── Attendance.js
│   │   │   ├── Enrollment.js
│   │   │   └── AuditLog.js
│   │   ├── routes/
│   │   │   ├── authRoutes.js
│   │   │   ├── userRoutes.js
│   │   │   ├── courseRoutes.js
│   │   │   ├── sessionRoutes.js
│   │   │   ├── attendanceRoutes.js
│   │   │   └── reportRoutes.js
│   │   ├── services/
│   │   │   ├── authService.js
│   │   │   ├── qrCodeService.js
│   │   │   ├── geoLocationService.js
│   │   │   ├── attendanceService.js
│   │   │   ├── notificationService.js
│   │   │   └── reportService.js
│   │   ├── utils/
│   │   │   ├── ApiError.js
│   │   │   ├── ApiResponse.js
│   │   │   ├── catchAsync.js
│   │   │   ├── jwt.js
│   │   │   ├── password.js
│   │   │   ├── qrcode.js
│   │   │   ├── geolocation.js
│   │   │   └── dateUtils.js
│   │   ├── validators/
│   │   │   ├── authValidator.js
│   │   │   ├── courseValidator.js
│   │   │   ├── sessionValidator.js
│   │   │   └── attendanceValidator.js
│   │   └── socket/
│   │       ├── handlers.js
│   │       └── middleware.js
│   └── tests/
│       ├── unit/
│       ├── integration/
│       └── setup.js
├── frontend/
│   ├── .env.example
│   ├── .eslintrc.js
│   ├── .prettierrc
│   ├── index.html
│   ├── package.json
│   ├── tailwind.config.js
│   ├── tsconfig.json
│   ├── vite.config.ts
│   ├── public/
│   │   └── favicon.ico
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── index.css
│       ├── vite-env.d.ts
│       ├── api/
│       │   ├── axios.ts           # Axios instance with interceptors
│       │   ├── queryClient.ts     # React Query setup
│       │   └── endpoints/         # API endpoint functions
│       ├── components/
│       │   ├── ui/                # shadcn/ui components
│       │   ├── shared/            # Shared components
│       │   ├── admin/
│       │   ├── faculty/
│       │   └── student/
│       ├── contexts/
│       │   ├── AuthContext.tsx
│       │   ├── SocketContext.tsx
│       │   └── ThemeContext.tsx
│       ├── hooks/
│       │   ├── useAuth.ts
│       │   ├── useSocket.ts
│       │   ├── useGeolocation.ts
│       │   ├── useQRScanner.ts
│       │   └── useAttendance.ts
│       ├── layouts/
│       │   ├── AdminLayout.tsx
│       │   ├── FacultyLayout.tsx
│       │   ├── StudentLayout.tsx
│       │   └── AuthLayout.tsx
│       ├── pages/
│       │   ├── auth/
│       │   │   ├── Login.tsx
│       │   │   ├── Register.tsx
│       │   │   ├── ForgotPassword.tsx
│       │   │   └── ResetPassword.tsx
│       │   ├── admin/
│       │   │   ├── Dashboard.tsx
│       │   │   ├── Users.tsx
│       │   │   ├── Courses.tsx
│       │   │   ├── Sessions.tsx
│       │   │   ├── Reports.tsx
│       │   │   └── Settings.tsx
│       │   ├── faculty/
│       │   │   ├── Dashboard.tsx
│       │   │   ├── Courses.tsx
│       │   │   ├── CourseDetail.tsx
│       │   │   ├── SessionManager.tsx
│       │   │   ├── QRDisplay.tsx
│       │   │   ├── AttendanceMarking.tsx
│       │   │   └── Reports.tsx
│       │   └── student/
│       │       ├── Dashboard.tsx
│       │       ├── Courses.tsx
│       │       ├── CourseDetail.tsx
│       │       ├── AttendanceHistory.tsx
│       │       ├── QRScanner.tsx
│       │       └── Profile.tsx
│       ├── routes/
│       │   ├── AppRoutes.tsx
│       │   ├── ProtectedRoute.tsx
│       │   └── roleRoutes.ts
│       ├── types/
│       │   ├── user.ts
│       │   ├── course.ts
│       │   ├── session.ts
│       │   ├── attendance.ts
│       │   └── api.ts
│       ├── utils/
│       │   ├── dateUtils.ts
│       │   ├── formatters.ts
│       │   ├── validators.ts
│       │   ├── constants.ts
│       │   └── helpers.ts
│       └── styles/
│           └── globals.css
└── docs/
    ├── API.md
    ├── DEPLOYMENT.md
    ├── DEVELOPMENT.md
    └── ARCHITECTURE.md
```

---

## Environment Variables

### Backend (.env)
```env
# Server
NODE_ENV=development
PORT=5000
CLIENT_URL=http://localhost:5173

# Database
MONGODB_URI=mongodb://localhost:27017/attendance-system
MONGODB_URI_TEST=mongodb://localhost:27017/attendance-system-test

# JWT
JWT_ACCESS_SECRET=your-256-bit-access-secret
JWT_REFRESH_SECRET=your-256-bit-refresh-secret
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d

# Security
BCRYPT_ROUNDS=12
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Email (for password reset)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
EMAIL_FROM=noreply@attendance-system.com

# File Upload (Cloudinary/AWS S3)
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret

# QR Code
QR_CODE_SECRET=your-qr-signing-secret
QR_CODE_EXPIRY_MINUTES=90

# Geolocation
DEFAULT_GEOFENCE_RADIUS=100
MAX_GEOFENCE_RADIUS=500

# Socket.io
SOCKET_IO_CORS_ORIGIN=http://localhost:5173

# Logging
LOG_LEVEL=info
```

### Frontend (.env)
```env
VITE_API_URL=http://localhost:5000/api
VITE_SOCKET_URL=http://localhost:5000
VITE_APP_NAME=Attendance System
VITE_DEFAULT_GEOFENCE_RADIUS=100
```

---

## API Response Standards

### Success Response
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Operation successful",
  "data": {},
  "meta": {
    "page": 1,
    "limit": 10,
    "total": 100,
    "totalPages": 10
  }
}
```

### Error Response
```json
{
  "success": false,
  "statusCode": 400,
  "message": "Validation failed",
  "errors": [
    { "field": "email", "message": "Invalid email format" }
  ],
  "stack": "..." // Only in development
}
```

---

## Testing Strategy

### Backend Tests
- Unit tests: Services, utilities, validators (Jest)
- Integration tests: API endpoints (Supertest)
- Database tests: In-memory MongoDB (mongodb-memory-server)
- Coverage target: >80%

### Frontend Tests
- Component tests: React Testing Library + Vitest
- Hook tests: Custom hooks
- Integration tests: User flows (MSW for API mocking)
- E2E tests: Critical paths (Cypress/Playwright)

---

## Deployment Architecture

### Development
```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Frontend   │────▶│  Backend    │────▶│  MongoDB    │
│  (Vite)     │     │  (Nodemon)  │     │  (Local)    │
│  :5173      │     │  :5000      │     │  :27017     │
└─────────────┘     └─────────────┘     └─────────────┘
```

### Production (Docker Compose)
```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Nginx     │────▶│  Backend    │────▶│   MongoDB   │
│  (Static +  │     │  (PM2/Node) │     │  (Replica   │
│  Proxy)     │     │  :5000      │     │  Set)       │
│  :80/443    │     └─────────────┘     └─────────────┘
└─────────────┘            │                    │
                           ▼                    ▼
                    ┌─────────────┐     ┌─────────────┐
                    │   Redis     │     │  Cloudinary │
                    │  (Sessions, │     │  (Media)    │
                    │   Cache)    │     └─────────────┘
                    └─────────────┘
```

---

## Key Implementation Details

### QR Code Generation
```javascript
// Token payload
{
  sessionId: "ObjectId",
  courseId: "ObjectId",
  facultyId: "ObjectId",
  timestamp: Date.now(),
  nonce: crypto.randomBytes(16).toString('hex')
}

// Signed with HS256 using QR_CODE_SECRET
// QR contains: { token: "signed.jwt.token" }
// Expires: session.endTime + attendanceWindow.closeAfter
```

### Geolocation Validation
```javascript
// Haversine formula for distance calculation
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Earth radius in meters
  const φ1 = lat1 * Math.PI/180;
  const φ2 = lat2 * Math.PI/180;
  const Δφ = (lat2-lat1) * Math.PI/180;
  const Δλ = (lon2-lon1) * Math.PI/180;
  
  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  
  return R * c; // Distance in meters
}

// Valid if distance <= geofenceRadius
```

### Attendance Status Logic
```javascript
function determineStatus(checkInTime, sessionStartTime, lateThreshold, allowLateEntry) {
  const diffMinutes = (checkInTime - sessionStartTime) / (1000 * 60);
  
  if (diffMinutes <= 0) return 'present';
  if (diffMinutes <= lateThreshold && allowLateEntry) return 'late';
  if (diffMinutes > lateThreshold && allowLateEntry) return 'late'; // but flagged
  return 'absent'; // Outside window
}
```

---

## Acceptance Criteria

### MVP (Minimum Viable Product)
- [ ] User authentication (login, JWT, roles)
- [ ] Admin: Create users, courses, enroll students
- [ ] Faculty: Create sessions, generate QR codes
- [ ] Student: Scan QR, mark attendance with location
- [ ] Real-time attendance updates in faculty view
- [ ] Basic attendance reports (CSV export)

### Full Feature Set
- [ ] All MVP features +
- [ ] Geofencing validation
- [ ] Late entry tracking
- [ ] Excuse/leave management
- [ ] Comprehensive analytics dashboard
- [ ] Email notifications
- [ ] Audit logging
- [ ] Mobile-responsive UI
- [ ] Dark mode support
- [ ] Multi-language ready (i18n)

---

## Success Metrics

- **Performance**: API response < 200ms (p95), Page load < 3s
- **Reliability**: 99.9% uptime, zero data loss
- **Security**: Zero critical vulnerabilities (OWASP Top 10)
- **Usability**: Attendance marking < 10 seconds
- **Scalability**: Support 10,000+ concurrent users

---

## Next Steps

1. **Initialize repository** with monorepo structure
2. **Set up backend** with Express, MongoDB, JWT auth
3. **Build core models** and validation schemas
4. **Implement authentication** endpoints
5. **Create frontend** with Vite + React + Tailwind
6. **Build role-based dashboards** progressively
7. **Add real-time features** with Socket.io
8. **Write tests** and documentation
9. **Containerize** and deploy

---

*Document Version: 1.0*
*Created: $(date)*
*Project: Online Attendance Management System*