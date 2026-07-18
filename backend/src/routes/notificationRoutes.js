import express from 'express';
import * as notificationController from '../controllers/notificationController.js';
import { protect } from '../middlewares/auth.js';
import { validate } from '../validators/index.js';
import { idParamSchema } from '../validators/index.js';

const router = express.Router();

router.use(protect);

router.get('/', notificationController.getNotifications);
router.get('/unread-count', notificationController.getUnreadCount);
router.patch('/read-all', notificationController.markAllAsRead);
router.patch('/:id/read', validate(idParamSchema), notificationController.markAsRead);
router.delete('/:id', validate(idParamSchema), notificationController.deleteNotification);

export default router;
