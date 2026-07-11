import Attendance from '../models/Attendance.js';
import Course from '../models/Course.js';
import Session from '../models/Session.js';
import User from '../models/User.js';
import Enrollment from '../models/Enrollment.js';
import AuditLog from '../models/AuditLog.js';
import { AppError, NotFoundError, AuthorizationError, ValidationError } from '../utils/AppError.js';
import { logger } from '../utils/logger.js';

export const getOverview = async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') {
      return next(new AuthorizationError('Admin access required'));
    }

    const [
      totalUsers,
      totalCourses,
      totalSessions,
      totalAttendance,
      recentActivity,
      attendanceTrends,
    ] = await Promise.all([
      User.countDocuments(),
      Course.countDocuments(),
      Session.countDocuments(),
      Attendance.countDocuments(),
      AuditLog.find()
        .sort({ timestamp: -1 })
        .limit(10)
        .populate('user', 'firstName lastName email role'),
      getAttendanceTrends(),
    ]);

    // User breakdown by role
    const userBreakdown = await User.aggregate([{ $group: { _id: '$role', count: { $sum: 1 } } }]);

    // Course breakdown by department
    const courseBreakdown = await Course.aggregate([
      { $group: { _id: '$department', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);

    // Session status breakdown
    const sessionBreakdown = await Session.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);

    // Attendance status breakdown
    const attendanceBreakdown = await Attendance.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);

    // Low attendance students count
    const lowAttendanceCount = await Attendance.countDocuments({
      status: { $in: ['absent', 'late'] },
    });

    res.status(200).json({
      success: true,
      data: {
        overview: {
          totalUsers,
          totalCourses,
          totalSessions,
          totalAttendanceRecords: totalAttendance,
          lowAttendanceCount,
        },
        breakdown: {
          users: userBreakdown,
          courses: courseBreakdown,
          sessions: sessionBreakdown,
          attendance: attendanceBreakdown,
        },
        recentActivity,
        attendanceTrends,
      },
    });
  } catch (error) {
    next(error);
  }
};

const getAttendanceTrends = async () => {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  return Attendance.aggregate([
    { $match: { markedAt: { $gte: thirtyDaysAgo } } },
    {
      $group: {
        _id: {
          date: { $dateToString: { format: '%Y-%m-%d', date: '$markedAt' } },
          status: '$status',
        },
        count: { $sum: 1 },
      },
    },
    {
      $group: {
        _id: '$_id.date',
        statuses: { $push: { status: '$_id.status', count: '$count' } },
      },
    },
    { $sort: { _id: 1 } },
  ]);
};

export const getFacultyReport = async (req, res, next) => {
  try {
    const { facultyId } = req.params;

    if (req.user.role === 'faculty' && facultyId !== req.user._id.toString()) {
      return next(new AuthorizationError('Access denied'));
    }

    const faculty = await User.findById(facultyId);
    if (!faculty || faculty.role !== 'faculty') {
      return next(new NotFoundError('Faculty'));
    }

    const courses = await Course.find({ faculty: facultyId, isActive: true });
    const courseIds = courses.map((c) => c._id);

    const [totalCourses, totalSessions, upcomingSessions, attendanceStats, coursePerformance] =
      await Promise.all([
        Course.countDocuments({ faculty: facultyId, isActive: true }),
        Session.countDocuments({ faculty: facultyId }),
        Session.countDocuments({
          faculty: facultyId,
          status: 'scheduled',
          date: { $gte: new Date() },
        }),
        Attendance.aggregate([
          { $match: { faculty: faculty._id } },
          { $group: { _id: '$status', count: { $sum: 1 } } },
        ]),
        Course.aggregate([
          { $match: { faculty: faculty._id, isActive: true } },
          {
            $lookup: {
              from: 'sessions',
              localField: '_id',
              foreignField: 'course',
              as: 'sessions',
            },
          },
          {
            $lookup: {
              from: 'attendances',
              localField: '_id',
              foreignField: 'course',
              as: 'attendances',
            },
          },
          {
            $project: {
              code: 1,
              name: 1,
              totalSessions: { $size: '$sessions' },
              completedSessions: {
                $size: {
                  $filter: {
                    input: '$sessions',
                    as: 's',
                    cond: { $eq: ['$$s.status', 'completed'] },
                  },
                },
              },
              totalAttendance: { $size: '$attendances' },
              presentCount: {
                $size: {
                  $filter: {
                    input: '$attendances',
                    as: 'a',
                    cond: { $in: ['$$a.status', ['present', 'late']] },
                  },
                },
              },
            },
          },
          {
            $addFields: {
              attendanceRate: {
                $cond: [
                  { $gt: ['$totalAttendance', 0] },
                  { $multiply: [{ $divide: ['$presentCount', '$totalAttendance'] }, 100] },
                  0,
                ],
              },
            },
          },
        ]),
      ]);

    res.status(200).json({
      success: true,
      data: {
        faculty: {
          name: `${faculty.firstName} ${faculty.lastName}`,
          email: faculty.email,
          employeeId: faculty.employeeId,
          department: faculty.department,
        },
        summary: {
          totalCourses,
          totalSessions,
          upcomingSessions,
        },
        attendanceStats,
        coursePerformance,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getStudentReport = async (req, res, next) => {
  try {
    const { studentId } = req.params;

    if (req.user.role === 'student' && studentId !== req.user._id.toString()) {
      return next(new AuthorizationError('Access denied'));
    }

    const student = await User.findById(studentId);
    if (!student || student.role !== 'student') {
      return next(new NotFoundError('Student'));
    }

    const enrollments = await Enrollment.find({ student: studentId, status: 'active' }).populate(
      'course',
      'code name department credits'
    );

    const courseIds = enrollments.map((e) => e.course._id);

    const [attendanceStats, courseAttendance, recentAttendance, lowAttendanceCourses] =
      await Promise.all([
        Attendance.getStudentSummary(studentId),
        Attendance.getStudentStats(studentId),
        Attendance.find({ student: studentId })
          .sort({ markedAt: -1 })
          .limit(10)
          .populate('session', 'title date startTime')
          .populate('course', 'code name'),
        Attendance.aggregate([
          { $match: { student: student._id } },
          {
            $group: {
              _id: '$course',
              total: { $sum: 1 },
              present: { $sum: { $cond: [{ $in: ['$status', ['present', 'late']] }, 1, 0] } },
              absent: { $sum: { $cond: [{ $eq: ['$status', 'absent'] }, 1, 0] } },
              late: { $sum: { $cond: [{ $eq: ['$status', 'late'] }, 1, 0] } },
            },
          },
          {
            $addFields: {
              percentage: { $multiply: [{ $divide: ['$present', '$total'] }, 100] },
            },
          },
          { $match: { percentage: { $lt: 75 } } },
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
              percentage: { $round: ['$percentage', 2] },
            },
          },
        ]),
      ]);

    res.status(200).json({
      success: true,
      data: {
        student: {
          name: `${student.firstName} ${student.lastName}`,
          email: student.email,
          studentId: student.studentId,
          program: student.program,
          year: student.year,
          semester: student.semester,
        },
        overallStats: attendanceStats,
        courseAttendance,
        recentAttendance,
        lowAttendanceCourses,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getCourseReport = async (req, res, next) => {
  try {
    const { courseId } = req.params;

    const course = await Course.findById(courseId).populate('faculty', 'firstName lastName email');
    if (!course) {
      return next(new NotFoundError('Course'));
    }

    if (req.user.role === 'faculty' && course.faculty._id.toString() !== req.user._id.toString()) {
      return next(new AuthorizationError('Access denied'));
    }

    const [overallStats, sessionStats, studentStats, enrollmentStats] = await Promise.all([
      Attendance.getCourseStats(courseId),
      Session.aggregate([
        { $match: { course: course._id } },
        {
          $lookup: {
            from: 'attendances',
            localField: '_id',
            foreignField: 'session',
            as: 'attendances',
          },
        },
        {
          $project: {
            _id: 1,
            title: 1,
            date: 1,
            startTime: 1,
            endTime: 1,
            status: 1,
            totalAttendances: { $size: '$attendances' },
            present: {
              $size: {
                $filter: {
                  input: '$attendances',
                  as: 'a',
                  cond: { $in: ['$$a.status', ['present', 'late']] },
                },
              },
            },
            absent: {
              $size: {
                $filter: {
                  input: '$attendances',
                  as: 'a',
                  cond: { $eq: ['$$a.status', 'absent'] },
                },
              },
            },
            late: {
              $size: {
                $filter: { input: '$attendances', as: 'a', cond: { $eq: ['$$a.status', 'late'] } },
              },
            },
            excused: {
              $size: {
                $filter: {
                  input: '$attendances',
                  as: 'a',
                  cond: { $eq: ['$$a.status', 'excused'] },
                },
              },
            },
          },
        },
        { $sort: { date: -1 } },
      ]),
      Attendance.aggregate([
        { $match: { course: course._id } },
        {
          $group: {
            _id: '$student',
            total: { $sum: 1 },
            present: { $sum: { $cond: [{ $in: ['$status', ['present', 'late']] }, 1, 0] } },
            absent: { $sum: { $cond: [{ $eq: ['$status', 'absent'] }, 1, 0] } },
            late: { $sum: { $cond: [{ $eq: ['$status', 'late'] }, 1, 0] } },
            excused: { $sum: { $cond: [{ $eq: ['$status', 'excused'] }, 1, 0] } },
          },
        },
        {
          $addFields: {
            attendanceRate: { $multiply: [{ $divide: ['$present', '$total'] }, 100] },
          },
        },
        {
          $lookup: {
            from: 'users',
            localField: '_id',
            foreignField: '_id',
            as: 'student',
          },
        },
        { $unwind: '$student' },
        {
          $project: {
            studentId: '$student.studentId',
            studentName: { $concat: ['$student.firstName', ' ', '$student.lastName'] },
            studentEmail: '$student.email',
            total: 1,
            present: 1,
            absent: 1,
            late: 1,
            excused: 1,
            attendanceRate: { $round: ['$attendanceRate', 2] },
          },
        },
        { $sort: { attendanceRate: 1 } },
      ]),
      Enrollment.aggregate([
        { $match: { course: course._id, status: 'active' } },
        { $count: 'activeEnrollments' },
      ]),
    ]);

    res.status(200).json({
      success: true,
      data: {
        course: {
          code: course.code,
          name: course.name,
          department: course.department,
          semester: course.semester,
          academicYear: course.academicYear,
          faculty: course.faculty,
        },
        enrollmentCount: enrollmentStats[0]?.activeEnrollments || 0,
        overallStats,
        sessionStats,
        studentStats,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getDepartmentReport = async (req, res, next) => {
  try {
    const { department } = req.params;

    if (req.user.role !== 'admin') {
      return next(new AuthorizationError('Admin access required'));
    }

    const courses = await Course.find({ department, isActive: true });
    const courseIds = courses.map((c) => c._id);

    const [totalCourses, totalStudents, overallAttendance, coursePerformance, facultyPerformance] =
      await Promise.all([
        Course.countDocuments({ department, isActive: true }),
        Enrollment.countDocuments({ course: { $in: courseIds }, status: 'active' }),
        Attendance.aggregate([
          { $match: { course: { $in: courseIds } } },
          { $group: { _id: '$status', count: { $sum: 1 } } },
        ]),
        Course.aggregate([
          { $match: { department, isActive: true } },
          {
            $lookup: {
              from: 'attendances',
              localField: '_id',
              foreignField: 'course',
              as: 'attendances',
            },
          },
          {
            $project: {
              code: 1,
              name: 1,
              totalAttendance: { $size: '$attendances' },
              present: {
                $size: {
                  $filter: {
                    input: '$attendances',
                    as: 'a',
                    cond: { $in: ['$$a.status', ['present', 'late']] },
                  },
                },
              },
            },
          },
          {
            $addFields: {
              attendanceRate: {
                $cond: [
                  { $gt: ['$totalAttendance', 0] },
                  { $multiply: [{ $divide: ['$present', '$totalAttendance'] }, 100] },
                  0,
                ],
              },
            },
          },
          { $sort: { attendanceRate: 1 } },
        ]),
        User.aggregate([
          { $match: { role: 'faculty', department, isActive: true } },
          {
            $lookup: {
              from: 'courses',
              localField: '_id',
              foreignField: 'faculty',
              as: 'courses',
            },
          },
          {
            $lookup: {
              from: 'attendances',
              localField: 'courses._id',
              foreignField: 'course',
              as: 'attendances',
            },
          },
          {
            $project: {
              name: { $concat: ['$firstName', ' ', '$lastName'] },
              email: 1,
              employeeId: 1,
              courseCount: { $size: '$courses' },
              totalAttendance: { $size: '$attendances' },
              present: {
                $size: {
                  $filter: {
                    input: '$attendances',
                    as: 'a',
                    cond: { $in: ['$$a.status', ['present', 'late']] },
                  },
                },
              },
            },
          },
          {
            $addFields: {
              attendanceRate: {
                $cond: [
                  { $gt: ['$totalAttendance', 0] },
                  { $multiply: [{ $divide: ['$present', '$totalAttendance'] }, 100] },
                  0,
                ],
              },
            },
          },
          { $sort: { attendanceRate: -1 } },
        ]),
      ]);

    res.status(200).json({
      success: true,
      data: {
        department,
        summary: { totalCourses, totalStudents },
        overallAttendance,
        coursePerformance,
        facultyPerformance,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getTrends = async (req, res, next) => {
  try {
    const { period = '30d', courseId, facultyId } = req.query;

    let days = 30;
    if (period === '7d') days = 7;
    else if (period === '90d') days = 90;
    else if (period === '1y') days = 365;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const query = { markedAt: { $gte: startDate } };
    if (courseId) query.course = courseId;
    if (facultyId) query.faculty = facultyId;

    // Daily attendance trends
    const dailyTrends = await Attendance.aggregate([
      { $match: query },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: '%Y-%m-%d', date: '$markedAt' } },
            status: '$status',
          },
          count: { $sum: 1 },
        },
      },
      {
        $group: {
          _id: '$_id.date',
          statuses: { $push: { status: '$_id.status', count: '$count' } },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // Weekly trends
    const weeklyTrends = await Attendance.aggregate([
      { $match: query },
      {
        $group: {
          _id: {
            week: { $dateToString: { format: '%Y-W%U', date: '$markedAt' } },
            status: '$status',
          },
          count: { $sum: 1 },
        },
      },
      {
        $group: {
          _id: '$_id.week',
          statuses: { $push: { status: '$_id.status', count: '$count' } },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // Monthly trends
    const monthlyTrends = await Attendance.aggregate([
      { $match: query },
      {
        $group: {
          _id: {
            month: { $dateToString: { format: '%Y-%m', date: '$markedAt' } },
            status: '$status',
          },
          count: { $sum: 1 },
        },
      },
      {
        $group: {
          _id: '$_id.month',
          statuses: { $push: { status: '$_id.status', count: '$count' } },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    res.status(200).json({
      success: true,
      data: {
        period,
        daily: dailyTrends,
        weekly: weeklyTrends,
        monthly: monthlyTrends,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getLowAttendanceReport = async (req, res, next) => {
  try {
    const { threshold = 75, courseId, department, page = 1, limit = 50 } = req.query;

    if (req.user.role !== 'admin' && req.user.role !== 'faculty') {
      return next(new AuthorizationError('Access denied'));
    }

    let query = {};

    if (req.user.role === 'faculty') {
      const courses = await Course.find({ faculty: req.user._id }).select('_id');
      const courseIds = courses.map((c) => c._id.toString());
      query.faculty = req.user._id;
      if (courseId && courseIds.includes(courseId)) {
        query.course = courseId;
      }
    } else {
      if (courseId) query.course = courseId;
      if (department) {
        const courses = await Course.find({ department }).select('_id');
        query.course = { $in: courses.map((c) => c._id) };
      }
    }

    const students = await Attendance.getLowAttendanceStudents(parseFloat(threshold), query);

    // Paginate
    const skip = (page - 1) * limit;
    const paginatedStudents = students.slice(skip, skip + parseInt(limit));

    res.status(200).json({
      success: true,
      data: { students: paginatedStudents, threshold: parseFloat(threshold) },
      meta: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: students.length,
        totalPages: Math.ceil(students.length / limit),
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getAuditLogs = async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') {
      return next(new AuthorizationError('Admin access required'));
    }

    const {
      page = 1,
      limit = 50,
      action,
      resource,
      userId,
      fromDate,
      toDate,
      sort = '-timestamp',
    } = req.query;

    const query = {};
    if (action) query.action = action;
    if (resource) query.resource = resource;
    if (userId) query.user = userId;
    if (fromDate || toDate) {
      query.timestamp = {};
      if (fromDate) query.timestamp.$gte = new Date(fromDate);
      if (toDate) query.timestamp.$lte = new Date(toDate);
    }

    const skip = (page - 1) * limit;

    const [logs, total] = await Promise.all([
      AuditLog.find(query)
        .populate('user', 'firstName lastName email role')
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit)),
      AuditLog.countDocuments(query),
    ]);

    res.status(200).json({
      success: true,
      data: { logs },
      meta: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    next(error);
  }
};
