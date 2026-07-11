import { logger } from '../utils/logger.js';
import AuditLog from '../models/AuditLog.js';

export const auditLogger = async (req, res, next) => {
  // Store original send to capture response
  const originalSend = res.send;
  let responseBody;

  res.send = function (body) {
    responseBody = body;
    return originalSend.call(this, body);
  };

  res.on('finish', async () => {
    // Only log specific actions (not every request)
    const shouldLog =
      ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) ||
      req.path.includes('/auth/') ||
      req.path.includes('/attendance/mark');

    if (!shouldLog) return;

    try {
      const user = req.user || null;
      const action = `${req.method} ${req.route?.path || req.path}`;
      const resource = req.route?.path?.split('/')[2] || 'Unknown';
      const resourceId = req.params.id || req.body?.id || null;

      await AuditLog.log({
        user: user?._id,
        action,
        resource,
        resourceId,
        details: {
          method: req.method,
          path: req.path,
          query: req.query,
          body: sanitizeBody(req.body),
          responseStatus: res.statusCode,
        },
        ip: req.ip || req.connection?.remoteAddress,
        userAgent: req.get('User-Agent'),
        success: res.statusCode < 400,
        errorMessage: res.statusCode >= 400 ? responseBody : null,
      });
    } catch (error) {
      logger.error('Audit log failed:', error);
    }
  });

  next();
};

const sanitizeBody = (body) => {
  if (!body) return {};
  const sanitized = { ...body };
  const sensitiveFields = [
    'password',
    'passwordHash',
    'refreshToken',
    'token',
    'qrToken',
    'authorization',
  ];
  sensitiveFields.forEach((field) => {
    if (sanitized[field]) sanitized[field] = '[REDACTED]';
  });
  return sanitized;
};
