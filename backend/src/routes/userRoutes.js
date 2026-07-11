import express from 'express';
import * as userController from '../controllers/userController.js';
import { protect, restrictTo } from '../middlewares/auth.js';
import { validate } from '../validators/index.js';
import { idParamSchema, registerSchema } from '../validators/index.js';

const router = express.Router();

router.use(protect);
router.use(restrictTo('admin'));

// User management (admin only)
router.get('/', userController.getUsers);
router.get('/faculty', userController.getFaculty);
router.get('/students', userController.getStudents);
router.get('/:id', validate(idParamSchema), userController.getUser);
router.post('/', validate(registerSchema), userController.createUser);
router.patch('/:id', userController.updateUser);
router.delete('/:id', userController.deactivateUser);
router.get('/:id/attendance', userController.getUserAttendance);

export default router;
