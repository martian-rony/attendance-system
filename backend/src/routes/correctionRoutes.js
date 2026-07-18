import express from 'express';
import * as correctionController from '../controllers/correctionController.js';
import { protect, restrictTo } from '../middlewares/auth.js';
import { validate } from '../validators/index.js';
import {
  createCorrectionSchema,
  resolveCorrectionSchema,
  idParamSchema,
} from '../validators/index.js';

const router = express.Router();

router.use(protect);

router.get('/', correctionController.getCorrections);

// Student raises a correction/dispute.
router.post(
  '/',
  restrictTo('student'),
  validate(createCorrectionSchema),
  correctionController.createCorrection
);

// Faculty/admin approve or reject.
router.patch(
  '/:id/resolve',
  restrictTo('admin', 'faculty'),
  validate(resolveCorrectionSchema),
  correctionController.resolveCorrection
);

export default router;
