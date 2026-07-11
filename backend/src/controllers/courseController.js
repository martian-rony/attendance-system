import Course from '../models/Course.js';
import Enrollment from '../models/Enrollment.js';
import Session from '../models/Session.js';
import User from '../models/User.js';
import { AppError, NotFoundError, AuthorizationError } from '../utils/AppError.js';
import { logger } from '../utils/logger.js';
import AuditLog from '../models/AuditLog.js';

export const createCourse = async (req, res, next) => {
  try {
    const courseData = {
      ...req.body,
      faculty: req.user.role === 'faculty' ? req.user._id : req.body.faculty,
    };

    const course = await Course.create(courseData);

    // Add faculty to course
    await User.findByIdAndUpdate(course.faculty, {
      $addToSet: { courses: course._id },
    });

    // Log audit
    await AuditLog.log({
      user: req.user._id,
      action: 'COURSE_CREATED',
      resource: 'Course',
      resourceId: course._id,
      details: { code: course.code, name: course.name, faculty: course.faculty },
      ip: req.ip,
      userAgent: req.get('User-Agent'),
    });

    logger.info(`Course created: ${course.code} by ${req.user.email}`);

    res.status(201).json({
      success: true,
      data: { course },
    });
  } catch (error) {
    next(error);
  }
};

export const getCourses = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 20,
      search,
      department,
      semester,
      academicYear,
      isActive,
      facultyId,
      sort = '-createdAt',
    } = req.query;

    const query = {};

    // Role-based filtering
    if (req.user.role === 'faculty') {
      query.faculty = req.user._id;
    } else if (req.user.role === 'student') {
      query.students = req.user._id;
      query.isActive = true;
    }

    if (facultyId) query.faculty = facultyId;
    if (department) query.department = department;
    if (semester) query.semester = parseInt(semester);
    if (academicYear) query.academicYear = academicYear;
    if (isActive !== undefined) query.isActive = isActive === 'true';
    if (search) {
      query.$or = [
        { code: { $regex: search, $options: 'i' } },
        { name: { $regex: search, $options: 'i' } },
      ];
    }

    const skip = (page - 1) * limit;

    const [courses, total] = await Promise.all([
      Course.find(query)
        .populate('faculty', 'firstName lastName email employeeId department')
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit)),
      Course.countDocuments(query),
    ]);

    // Add enrolled count for each course
    const coursesWithCount = await Promise.all(
      courses.map(async (course) => {
        const enrolledCount = await Enrollment.countDocuments({
          course: course._id,
          status: 'active',
        });
        return {
          ...course.toObject(),
          enrolledCount,
        };
      })
    );

    res.status(200).json({
      success: true,
      data: { courses: coursesWithCount },
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

export const getCourse = async (req, res, next) => {
  try {
    const course = await Course.findById(req.params.id)
      .populate('faculty', 'firstName lastName email employeeId department designation avatar')
      .populate(
        'students',
        'firstName lastName email studentId rollNumber program year semester avatar'
      );

    if (!course) {
      return next(new NotFoundError('Course'));
    }

    // Check authorization
    if (req.user.role === 'faculty' && course.faculty._id.toString() !== req.user._id.toString()) {
      return next(new AuthorizationError('You can only access your own courses'));
    }

    if (
      req.user.role === 'student' &&
      !course.students.some((s) => s._id.toString() === req.user._id.toString())
    ) {
      return next(new AuthorizationError('You are not enrolled in this course'));
    }

    // Get enrollment stats
    const [enrolledCount, sessionCount] = await Promise.all([
      Enrollment.countDocuments({ course: course._id, status: 'active' }),
      Session.countDocuments({ course: course._id }),
    ]);

    res.status(200).json({
      success: true,
      data: {
        course: {
          ...course.toObject(),
          enrolledCount,
          sessionCount,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

export const updateCourse = async (req, res, next) => {
  try {
    const course = await Course.findById(req.params.id);
    if (!course) {
      return next(new NotFoundError('Course'));
    }

    // Check authorization
    if (req.user.role === 'faculty' && course.faculty.toString() !== req.user._id.toString()) {
      return next(new AuthorizationError('You can only update your own courses'));
    }

    const updatedCourse = await Course.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    }).populate('faculty', 'firstName lastName email');

    // Log audit
    await AuditLog.log({
      user: req.user._id,
      action: 'COURSE_UPDATED',
      resource: 'Course',
      resourceId: course._id,
      details: { updatedFields: Object.keys(req.body) },
      ip: req.ip,
      userAgent: req.get('User-Agent'),
    });

    res.status(200).json({
      success: true,
      data: { course: updatedCourse },
    });
  } catch (error) {
    next(error);
  }
};

export const deleteCourse = async (req, res, next) => {
  try {
    const course = await Course.findById(req.params.id);
    if (!course) {
      return next(new NotFoundError('Course'));
    }

    if (req.user.role === 'faculty' && course.faculty.toString() !== req.user._id.toString()) {
      return next(new AuthorizationError('You can only delete your own courses'));
    }

    // Check if course has active sessions
    const activeSessions = await Session.countDocuments({
      course: course._id,
      status: { $in: ['scheduled', 'active'] },
    });

    if (activeSessions > 0) {
      return next(new AppError('Cannot delete course with active sessions', 400));
    }

    await course.deleteOne();

    // Log audit
    await AuditLog.log({
      user: req.user._id,
      action: 'COURSE_DELETED',
      resource: 'Course',
      resourceId: course._id,
      details: { code: course.code, name: course.name },
      ip: req.ip,
      userAgent: req.get('User-Agent'),
    });

    res.status(200).json({
      success: true,
      message: 'Course deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};

export const enrollStudents = async (req, res, next) => {
  try {
    const { studentIds } = req.body;
    const courseId = req.params.id;

    const course = await Course.findById(courseId);
    if (!course) {
      return next(new NotFoundError('Course'));
    }

    if (req.user.role === 'faculty' && course.faculty.toString() !== req.user._id.toString()) {
      return next(new AuthorizationError('You can only enroll students in your own courses'));
    }

    const results = {
      enrolled: [],
      alreadyEnrolled: [],
      notFound: [],
    };

    for (const studentId of studentIds) {
      const student = await User.findById(studentId);
      if (!student || student.role !== 'student') {
        results.notFound.push(studentId);
        continue;
      }

      try {
        const enrollment = await Enrollment.enrollStudent(studentId, courseId, req.user._id);
        results.enrolled.push({ studentId, enrollmentId: enrollment._id });

        // Add to course students array
        await course.addStudent(studentId);
      } catch (error) {
        if (error.message.includes('already enrolled')) {
          results.alreadyEnrolled.push(studentId);
        } else {
          throw error;
        }
      }
    }

    // Log audit
    await AuditLog.log({
      user: req.user._id,
      action: 'STUDENTS_ENROLLED',
      resource: 'Course',
      resourceId: courseId,
      details: {
        enrolledCount: results.enrolled.length,
        studentIds: results.enrolled.map((e) => e.studentId),
      },
      ip: req.ip,
      userAgent: req.get('User-Agent'),
    });

    res.status(200).json({
      success: true,
      data: results,
    });
  } catch (error) {
    next(error);
  }
};

export const removeStudent = async (req, res, next) => {
  try {
    const { courseId, studentId } = req.params;

    const course = await Course.findById(courseId);
    if (!course) {
      return next(new NotFoundError('Course'));
    }

    if (req.user.role === 'faculty' && course.faculty.toString() !== req.user._id.toString()) {
      return next(new AuthorizationError('You can only remove students from your own courses'));
    }

    const enrollment = await Enrollment.dropStudent(studentId, courseId, 'Removed by faculty');

    await course.removeStudent(studentId);

    // Log audit
    await AuditLog.log({
      user: req.user._id,
      action: 'STUDENT_REMOVED_FROM_COURSE',
      resource: 'Course',
      resourceId: courseId,
      details: { studentId, reason: 'Removed by faculty' },
      ip: req.ip,
      userAgent: req.get('User-Agent'),
    });

    res.status(200).json({
      success: true,
      message: 'Student removed from course',
    });
  } catch (error) {
    next(error);
  }
};

export const getCourseStudents = async (req, res, next) => {
  try {
    const course = await Course.findById(req.params.id);
    if (!course) {
      return next(new NotFoundError('Course'));
    }

    if (req.user.role === 'faculty' && course.faculty.toString() !== req.user._id.toString()) {
      return next(new AuthorizationError('You can only view students in your own courses'));
    }

    const enrollments = await Enrollment.getActiveStudents(req.params.id);

    res.status(200).json({
      success: true,
      data: { students: enrollments },
    });
  } catch (error) {
    next(error);
  }
};

export const getCourseSessions = async (req, res, next) => {
  try {
    const { status, page = 1, limit = 20, sort = '-date' } = req.query;
    const courseId = req.params.id;

    const course = await Course.findById(courseId);
    if (!course) {
      return next(new NotFoundError('Course'));
    }

    if (req.user.role === 'faculty' && course.faculty.toString() !== req.user._id.toString()) {
      return next(new AuthorizationError('You can only view sessions for your own courses'));
    }

    const query = { course: courseId };
    if (status) query.status = status;

    const skip = (page - 1) * limit;

    const [sessions, total] = await Promise.all([
      Session.find(query)
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit))
        .populate('course', 'code name'),
      Session.countDocuments(query),
    ]);

    res.status(200).json({
      success: true,
      data: { sessions },
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

export const getCourseAttendanceReport = async (req, res, next) => {
  try {
    const { format = 'json', startDate, endDate } = req.query;
    const courseId = req.params.id;

    const course = await Course.findById(courseId);
    if (!course) {
      return next(new NotFoundError('Course'));
    }

    if (req.user.role === 'faculty' && course.faculty.toString() !== req.user._id.toString()) {
      return next(new AuthorizationError('Access denied'));
    }

    const Attendance = (await import('../models/Attendance.js')).default;

    // Get all active enrollments
    const enrollments = await Enrollment.find({ course: courseId, status: 'active' }).populate(
      'student',
      'firstName lastName studentId email'
    );

    // Get attendance stats for each student
    const studentReports = await Promise.all(
      enrollments.map(async (enrollment) => {
        const stats = await Attendance.getStudentCourseAttendance(enrollment.student._id, courseId);
        return {
          student: enrollment.student,
          stats,
        };
      })
    );

    // Overall course stats
    const courseStats = await Attendance.getCourseStats(courseId);

    res.status(200).json({
      success: true,
      data: {
        course: { code: course.code, name: course.name },
        courseStats,
        studentReports,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getMyCourses = async (req, res, next) => {
  try {
    let courses;

    if (req.user.role === 'faculty') {
      courses = await Course.findByFaculty(req.user._id, { activeOnly: true });
    } else if (req.user.role === 'student') {
      courses = await Course.findByStudent(req.user._id);
    } else {
      return next(new AuthorizationError('Invalid role'));
    }

    res.status(200).json({
      success: true,
      data: { courses },
    });
  } catch (error) {
    next(error);
  }
};

export const getDepartments = async (req, res, next) => {
  try {
    const departments = await Course.distinct('department', { isActive: true });
    res.status(200).json({
      success: true,
      data: { departments: departments.sort() },
    });
  } catch (error) {
    next(error);
  }
};

export const getAcademicYears = async (req, res, next) => {
  try {
    const years = await Course.distinct('academicYear', { isActive: true });
    res.status(200).json({
      success: true,
      data: { academicYears: years.sort().reverse() },
    });
  } catch (error) {
    next(error);
  }
};
