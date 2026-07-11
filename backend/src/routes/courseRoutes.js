import express from 'express';
import * as courseController from '../controllers/courseController.js';
import { protect, restrictTo } from '../middlewares/auth.js';
import { validate } from '../validators/index.js';
import {
  createCourseSchema,
  updateCourseSchema,
  enrollStudentsSchema,
  idParamSchema,
} from '../validators/index.js';

const router = express.Router();

router.use(protect);

// All courses (role-filtered in controller)
router.get('/', courseController.getCourses);
router.get('/my-courses', courseController.getMyCourses);
router.get('/departments', courseController.getDepartments);
router.get('/academic-years', courseController.getAcademicYears);

// Faculty & Admin can create
router.post(
  '/',
  restrictTo('admin', 'faculty'),
  validate(createCourseSchema),
  courseController.createCourse
);

// Course-specific routes
router.get('/:id', validate(idParamSchema), courseController.getCourse);
router.patch('/:id', validate(updateCourseSchema), courseController.updateCourse);
router.delete(
  '/:id',
  restrictTo('admin', 'faculty'),
  validate(idParamSchema),
  courseController.deleteCourse
);

// Enrollment
router.post(
  '/:id/enroll',
  restrictTo('admin', 'faculty'),
  validate(enrollStudentsSchema),
  courseController.enrollStudents
);
router.delete(
  '/:id/enroll/:studentId',
  restrictTo('admin', 'faculty'),
  courseController.removeStudent
);
router.get('/:id/students', validate(idParamSchema), courseController.getCourseStudents);
router.get('/:id/sessions', validate(idParamSchema), courseController.getCourseSessions);
router.get(
  '/:id/attendance-report',
  validate(idParamSchema),
  courseController.getCourseAttendanceReport
);

export default router;
