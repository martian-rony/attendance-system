import express from 'express';
import * as attendanceController from '../controllers/attendanceController.js';
import { protect, restrictTo } from '../middlewares/auth.js';
import { validate } from '../validators/index.js';
import {
  markAttendanceSchema,
  bulkMarkAttendanceSchema,
  updateAttendanceSchema,
  idParamSchema,
} from '../validators/index.js';

const router = express.Router();

router.use(protect);

// Student marks own attendance (QR + geo)
router.post('/mark', validate(markAttendanceSchema), attendanceController.markAttendance);

// Faculty manual marking
router.post(
  '/mark-manual',
  restrictTo('admin', 'faculty'),
  attendanceController.markAttendanceManual
);
router.post(
  '/bulk',
  restrictTo('admin', 'faculty'),
  validate(bulkMarkAttendanceSchema),
  attendanceController.bulkMarkAttendance
);

// Update attendance record
router.patch('/:id', validate(updateAttendanceSchema), attendanceController.updateAttendance);

// Student attendance history
router.get('/student/:studentId?', attendanceController.getStudentAttendance);

// Session attendance
router.get('/session/:sessionId', attendanceController.getSessionAttendance);

// Summary & stats
router.get('/summary', attendanceController.getAttendanceSummary);
router.get('/stats/:courseId', attendanceController.getCourseAttendanceStats);
router.get('/low-attendance', attendanceController.getLowAttendanceStudents);
router.get('/export', attendanceController.exportAttendance);

export default router;
