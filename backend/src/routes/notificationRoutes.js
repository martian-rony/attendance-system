import express from 'express';
import { protect } from '../middlewares/auth.js';

const router = express.Router();

// Placeholder notification routes (expanded in real-time phase)
router.use(protect);

router.get('/', (req, res) => {
  res.status(200).json({ success: true, data: { notifications: [] } });
});

router.patch('/:id/read', (req, res) => {
  res.status(200).json({ success: true, message: 'Notification marked as read' });
});

router.patch('/read-all', (req, res) => {
  res.status(200).json({ success: true, message: 'All notifications marked as read' });
});

export default router;
