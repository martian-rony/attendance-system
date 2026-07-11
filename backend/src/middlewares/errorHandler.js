import { logger } from '../utils/logger.js';
import { AppError } from '../utils/AppError.js';

export const handleCastErrorDB = (err) => {
  const message = `Invalid ${err.path}: ${err.value}`;
  return new AppError(message, 400);
};

export const handleDuplicateFieldsDB = (err) => {
  const value = err.errmsg?.match(/(["'])(\\?.)*?\1/)?.[0] || 'duplicate value';
  const message = `Duplicate field value: ${value}. Please use another value.`;
  return new AppError(message, 400);
};

export const handleValidationErrorDB = (err) => {
  const errors = Object.values(err.errors).map((el) => el.message);
  const message = `Invalid input data. ${errors.join('. ')}`;
  return new AppError(message, 400);
};

export const handleJWTError = () => new AppError('Invalid token. Please log in again.', 401);
export const handleJWTExpiredError = () =>
  new AppError('Your token has expired. Please log in again.', 401);

export const sendErrorDev = (err, res) => {
  res.status(err.statusCode).json({
    success: false,
    error: err,
    message: err.message,
    ...(err.details && { details: err.details }),
    stack: err.stack,
  });
};

export const sendErrorProd = (err, res) => {
  // Operational, trusted error: send message to client
  if (err.isOperational) {
    res.status(err.statusCode).json({
      success: false,
      message: err.message,
      ...(err.errors && { errors: err.errors }),
      ...(err.details && { details: err.details }),
    });
  } else {
    // Programming or other unknown error: don't leak error details
    logger.error('ERROR 💥', err);
    res.status(500).json({
      success: false,
      message: 'Something went very wrong!',
    });
  }
};

export const errorHandler = (err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';

  if (process.env.NODE_ENV === 'development') {
    sendErrorDev(err, res);
  } else {
    let error = { ...err };
    error.message = err.message;

    if (error.name === 'CastError') error = handleCastErrorDB(error);
    if (error.code === 11000) error = handleDuplicateFieldsDB(error);
    if (error.name === 'ValidationError') error = handleValidationErrorDB(error);
    if (error.name === 'JsonWebTokenError') error = handleJWTError();
    if (error.name === 'TokenExpiredError') error = handleJWTExpiredError();

    sendErrorProd(error, res);
  }
};
