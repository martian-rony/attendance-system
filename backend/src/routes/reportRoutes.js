import express from 'express';
import * as reportController from '../controllers/reportController.js';
import { protect, restrictTo } from '../middlewares/auth.js';
import { validate } from '../validators/index.js';
import { idParamSchema } from '../validators/index.js';

const router = express.Router();

router.use(protect);

// System overview (admin)
router.get('/overview', restrictTo('admin'), reportController.getOverview);

// Faculty report
router.get('/faculty/:id', restrictTo('admin', 'faculty'), reportController.getFacultyReport);

// Student report
router.get('/student/:id', reportController.getStudentReport);

// Course report
router.get('/course/:courseId', reportController.getCourseReport);

// Department report (admin)
router.get('/department/:dept', restrictTo('admin'), reportController.getDepartmentReport);

// Trends
router.get('/trends', reportController.getTrends);

// Low attendance
router.get('/low-attendance', reportController.getLowAttendanceReport);

// Audit logs (admin)
router.get('/audit-logs', restrictTo('admin'), reportController.getAuditLogs);

export default router;
