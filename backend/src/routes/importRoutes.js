import express from 'express';
import * as importController from '../controllers/importController.js';
import { protect, restrictTo } from '../middlewares/auth.js';
import { validate } from '../validators/index.js';
import { idParamSchema } from '../validators/index.js';

const router = express.Router();

router.use(protect);

// Templates & roster export (faculty + admin).
router.get('/template/students', restrictTo('admin'), importController.studentTemplate);
router.get(
  '/courses/:id/roster.csv',
  restrictTo('admin', 'faculty'),
  validate(idParamSchema),
  importController.exportRoster
);

// Bulk student creation (admin only).
router.post('/students', restrictTo('admin'), importController.importStudents);

// Bulk enrollment into a course (faculty + admin).
router.post(
  '/courses/:id/enroll',
  restrictTo('admin', 'faculty'),
  validate(idParamSchema),
  importController.importEnrollments
);

export default router;
