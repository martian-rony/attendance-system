import User from '../models/User.js';
import Course from '../models/Course.js';
import Enrollment from '../models/Enrollment.js';
import AuditLog from '../models/AuditLog.js';
import { AppError, NotFoundError, AuthorizationError, ValidationError } from '../utils/AppError.js';
import { parseCSV, toCSV } from '../utils/csv.js';
import { notify } from '../services/notificationService.js';

/**
 * POST /api/import/students
 * Admin bulk-creates student accounts from CSV text.
 * Body: { csv: "<raw csv>", defaultPassword?: "Student@123" }
 * Expected columns (case-insensitive): firstName,lastName,email,studentId,
 *   program,year,semester,rollNumber,phone,password (password optional).
 * Idempotent: existing emails are skipped, not duplicated or errored.
 */
export const importStudents = async (req, res, next) => {
  try {
    const { csv, defaultPassword } = req.body;
    if (!csv || typeof csv !== 'string') {
      return next(new ValidationError('csv (string) is required'));
    }

    const rows = parseCSV(csv);
    if (rows.length === 0) {
      return next(new ValidationError('CSV has no data rows'));
    }

    const fallbackPw = defaultPassword || 'Student@123';
    const results = { created: [], skipped: [], failed: [] };

    for (const [idx, row] of rows.entries()) {
      const line = idx + 2; // +1 header, +1 for 1-based
      const email = (row.email || '').toLowerCase().trim();
      const firstName = row.firstname || row.firstName;
      const lastName = row.lastname || row.lastName;

      if (!email || !firstName || !lastName) {
        results.failed.push({ line, email, reason: 'Missing firstName, lastName, or email' });
        continue;
      }

      try {
        const existing = await User.findOne({ email });
        if (existing) {
          results.skipped.push({ line, email, reason: 'Email already exists' });
          continue;
        }

        const user = await User.create({
          email,
          passwordHash: row.password || fallbackPw,
          firstName,
          lastName,
          role: 'student',
          studentId: row.studentid || row.studentId || undefined,
          program: row.program || undefined,
          year: row.year ? parseInt(row.year, 10) : undefined,
          semester: row.semester ? parseInt(row.semester, 10) : undefined,
          rollNumber: row.rollnumber || row.rollNumber || undefined,
          phone: row.phone || undefined,
        });

        results.created.push({ line, email, id: user._id });
      } catch (err) {
        results.failed.push({ line, email, reason: err.message });
      }
    }

    await AuditLog.log({
      user: req.user._id,
      action: 'STUDENTS_IMPORTED',
      resource: 'User',
      details: {
        created: results.created.length,
        skipped: results.skipped.length,
        failed: results.failed.length,
      },
      ip: req.ip,
      userAgent: req.get('User-Agent'),
    });

    req.io?.to('role:admin').emit('user:created', { bulk: true });

    res.status(200).json({
      success: true,
      data: {
        summary: {
          total: rows.length,
          created: results.created.length,
          skipped: results.skipped.length,
          failed: results.failed.length,
        },
        ...results,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/import/courses/:id/enroll
 * Bulk-enroll students into a course from CSV. Matches by email OR studentId.
 * Body: { csv: "<raw csv>" } with a column named `email` or `studentId`.
 */
export const importEnrollments = async (req, res, next) => {
  try {
    const { csv } = req.body;
    const courseId = req.params.id;
    if (!csv) return next(new ValidationError('csv (string) is required'));

    const course = await Course.findById(courseId);
    if (!course) return next(new NotFoundError('Course'));
    if (req.user.role === 'faculty' && course.faculty.toString() !== req.user._id.toString()) {
      return next(new AuthorizationError('You can only enroll students in your own courses'));
    }

    const rows = parseCSV(csv);
    const results = { enrolled: [], alreadyEnrolled: [], notFound: [] };

    for (const [idx, row] of rows.entries()) {
      const line = idx + 2;
      const email = (row.email || '').toLowerCase().trim();
      const studentId = (row.studentid || row.studentId || '').toUpperCase().trim();

      const student = await User.findOne({
        role: 'student',
        ...(email ? { email } : { studentId }),
      });

      if (!student) {
        results.notFound.push({ line, email: email || studentId });
        continue;
      }

      try {
        const enrollment = await Enrollment.enrollStudent(student._id, courseId, req.user._id);
        await course.addStudent(student._id);
        results.enrolled.push({ line, studentId: student._id, enrollmentId: enrollment._id });
        notify({
          recipient: student._id,
          type: 'enrollment_added',
          title: 'Enrolled in a new course',
          body: `You have been enrolled in ${course.code} - ${course.name}.`,
          link: '/student/courses',
          data: { courseId: course._id },
        });
      } catch (err) {
        if (err.message.includes('already enrolled')) {
          results.alreadyEnrolled.push({ line, studentId: student._id });
        } else {
          results.notFound.push({ line, email: email || studentId, reason: err.message });
        }
      }
    }

    await AuditLog.log({
      user: req.user._id,
      action: 'ENROLLMENTS_IMPORTED',
      resource: 'Course',
      resourceId: courseId,
      details: { enrolled: results.enrolled.length },
      ip: req.ip,
      userAgent: req.get('User-Agent'),
    });

    res.status(200).json({
      success: true,
      data: {
        summary: {
          total: rows.length,
          enrolled: results.enrolled.length,
          alreadyEnrolled: results.alreadyEnrolled.length,
          notFound: results.notFound.length,
        },
        ...results,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/import/template/students
 * Download a blank CSV template with the expected student columns.
 */
export const studentTemplate = (req, res) => {
  const csv = toCSV(
    [
      {
        firstName: 'Jane',
        lastName: 'Doe',
        email: 'jane.doe@college.edu',
        studentId: 'S1001',
        program: 'B.Tech CSE',
        year: '2',
        semester: '3',
        rollNumber: 'CSE2023-045',
        phone: '',
        password: '',
      },
    ],
    ['firstName', 'lastName', 'email', 'studentId', 'program', 'year', 'semester', 'rollNumber', 'phone', 'password']
  );
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=student-import-template.csv');
  res.send(csv);
};

/**
 * GET /api/import/courses/:id/roster.csv
 * Export a course's enrolled-student roster as CSV.
 */
export const exportRoster = async (req, res, next) => {
  try {
    const courseId = req.params.id;
    const course = await Course.findById(courseId);
    if (!course) return next(new NotFoundError('Course'));
    if (req.user.role === 'faculty' && course.faculty.toString() !== req.user._id.toString()) {
      return next(new AuthorizationError('Access denied'));
    }

    const enrollments = await Enrollment.find({ course: courseId, status: 'active' }).populate(
      'student',
      'firstName lastName email studentId program year semester rollNumber'
    );

    const records = enrollments
      .filter((e) => e.student)
      .map((e) => ({
        studentId: e.student.studentId || '',
        firstName: e.student.firstName,
        lastName: e.student.lastName,
        email: e.student.email,
        program: e.student.program || '',
        year: e.student.year || '',
        semester: e.student.semester || '',
        rollNumber: e.student.rollNumber || '',
      }));

    const csv = toCSV(records, [
      'studentId',
      'firstName',
      'lastName',
      'email',
      'program',
      'year',
      'semester',
      'rollNumber',
    ]);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=roster-${course.code}-${Date.now()}.csv`
    );
    res.send(csv);
  } catch (error) {
    next(error);
  }
};
