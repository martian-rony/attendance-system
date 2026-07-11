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

    // Notify admins so their course list refreshes without a manual reload.
    req.io?.to('role:admin').emit('course:created', {
      courseId: course._id,
    });

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
      // Membership is sourced from the Enrollment collection (the source of
      // truth), NOT the denormalized Course.students array — that array can
      // drift out of sync if it is ever wiped or only partially updated, which
      // would make a genuinely-enrolled student vanish from their course list.
      const enrolledIds = (
        await Enrollment.find({ student: req.user._id, status: 'active' }).select('course')
      ).map((e) => e.course);
      query._id = { $in: enrolledIds };
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

    if (req.user.role === 'student') {
      // Authorization is checked against Enrollment (source of truth), not the
      // denormalized Course.students array which may be stale.
      const enrollment = await Enrollment.findOne({
        student: req.user._id,
        course: course._id,
        status: 'active',
      });
      if (!enrollment) {
        return next(new AuthorizationError('You are not enrolled in this course'));
      }
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
      // Source of truth is the Enrollment collection, NOT the denormalized
      // Course.students array (which can drift if ever wiped/stale). Derive
      // the course list from active enrollments so a real enrollment is always
      // visible regardless of the array's state.
      const enrollments = await Enrollment.getStudentEnrollments(req.user._id, {
        activeOnly: true,
      });
      courses = enrollments.map((e) => e.course).filter(Boolean);
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

// Student self-enrollment: browse all active courses with an `enrolled` flag.
export const browseCourses = async (req, res, next) => {
  try {
    if (req.user.role !== 'student') {
      return next(new AuthorizationError('Only students can browse courses'));
    }

    const courses = await Course.find({ isActive: true })
      .populate('faculty', 'firstName lastName email department')
      .sort({ code: 1 });

    const enrolledIds = new Set(
      (
        await Enrollment.find({
          student: req.user._id,
          status: 'active',
        }).select('course')
      ).map((e) => e.course.toString())
    );

    const data = courses.map((c) => ({
      ...c.toObject(),
      enrolled: enrolledIds.has(c._id.toString()),
    }));

    res.status(200).json({ success: true, data: { courses: data } });
  } catch (error) {
    next(error);
  }
};

// Student joins a course themselves.
export const enrollSelf = async (req, res, next) => {
  try {
    if (req.user.role !== 'student') {
      return next(new AuthorizationError('Only students can enroll themselves'));
    }

    const course = await Course.findById(req.params.id);
    if (!course) return next(new NotFoundError('Course'));
    if (!course.isActive) {
      return next(new AppError('This course is not open for enrollment', 400));
    }

    // Already enrolled?
    const existing = await Enrollment.findOne({
      student: req.user._id,
      course: course._id,
    });
    if (existing) {
      if (existing.status === 'active') {
        return res.status(200).json({
          success: true,
          message: 'Already enrolled',
          data: { enrollment: existing },
        });
      }
      // Reactivate a dropped/waitlisted enrollment.
      existing.status = 'active';
      existing.droppedAt = null;
      existing.dropReason = null;
      await existing.save();
      await course.addStudent(req.user._id);
      return res
        .status(200)
        .json({ success: true, message: 'Re-enrolled', data: { enrollment: existing } });
    }

    const enrollment = await Enrollment.enrollStudent(
      req.user._id,
      course._id,
      req.user._id
    );

    await AuditLog.log({
      user: req.user._id,
      action: 'STUDENT_SELF_ENROLLED',
      resource: 'Course',
      resourceId: course._id,
      details: { courseCode: course.code },
      ip: req.ip,
      userAgent: req.get('User-Agent'),
    });

    res.status(201).json({ success: true, data: { enrollment } });
  } catch (error) {
    next(error);
  }
};

// Student leaves a course they joined.
export const unenrollSelf = async (req, res, next) => {
  try {
    if (req.user.role !== 'student') {
      return next(new AuthorizationError('Only students can unenroll themselves'));
    }

    const enrollment = await Enrollment.findOne({
      student: req.user._id,
      course: req.params.id,
    });
    if (!enrollment) return next(new NotFoundError('Enrollment'));

    await enrollment.drop('Left by student', req.user._id);

    res.status(200).json({ success: true, message: 'Left course' });
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
