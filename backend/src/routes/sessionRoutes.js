import express from 'express';
import * as sessionController from '../controllers/sessionController.js';
import { protect, restrictTo } from '../middlewares/auth.js';
import { validate } from '../validators/index.js';
import { createSessionSchema, updateSessionSchema, idParamSchema } from '../validators/index.js';

const router = express.Router();

router.use(protect);

// Session list & filters
router.get('/', sessionController.getSessions);
router.get('/active', sessionController.getActiveSessions);
router.get('/upcoming', sessionController.getUpcomingSessions);
router.get('/today', sessionController.getTodaysSessions);

// Create (faculty/admin)
router.post(
  '/',
  restrictTo('admin', 'faculty'),
  validate(createSessionSchema),
  sessionController.createSession
);

// Create a recurring weekly series (faculty/admin)
router.post(
  '/recurring',
  restrictTo('admin', 'faculty'),
  sessionController.createRecurringSessions
);

// Session-specific
router.get('/:id', validate(idParamSchema), sessionController.getSession);
router.patch('/:id', validate(updateSessionSchema), sessionController.updateSession);
router.delete(
  '/:id',
  restrictTo('admin', 'faculty'),
  validate(idParamSchema),
  sessionController.deleteSession
);

// Session lifecycle (faculty/admin)
router.post(
  '/:id/start',
  restrictTo('admin', 'faculty'),
  validate(idParamSchema),
  sessionController.startSession
);
router.post(
  '/:id/end',
  restrictTo('admin', 'faculty'),
  validate(idParamSchema),
  sessionController.endSession
);
router.get('/:id/qr', validate(idParamSchema), sessionController.getSessionQR);
router.get('/:id/attendance', validate(idParamSchema), sessionController.getSessionAttendance);

export default router;
