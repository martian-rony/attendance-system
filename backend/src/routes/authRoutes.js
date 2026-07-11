import express from 'express';
import * as authController from '../controllers/authController.js';
import { protect, restrictTo } from '../middlewares/auth.js';
import { validate } from '../validators/index.js';
import {
  registerSchema,
  loginSchema,
  refreshTokenSchema,
  changePasswordSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  updateProfileSchema,
} from '../validators/index.js';

const router = express.Router();

// Public routes
router.post('/register', validate(registerSchema), authController.register);
router.post('/login', validate(loginSchema), authController.login);
router.post('/refresh', validate(refreshTokenSchema), authController.refreshToken);
router.post('/forgot-password', validate(forgotPasswordSchema), authController.forgotPassword);
router.post('/reset-password', validate(resetPasswordSchema), authController.resetPassword);

// Protected routes
router.use(protect);
router.post('/logout', authController.logout);
router.get('/me', authController.getMe);
router.patch('/update-profile', validate(updateProfileSchema), authController.updateProfile);
router.post('/change-password', validate(changePasswordSchema), authController.changePassword);
router.get('/verify-email/:token', authController.verifyEmail);

export default router;
