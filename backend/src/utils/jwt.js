import jwt from 'jsonwebtoken';
import crypto from 'crypto';

const secret = () =>
  process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production-min-32-chars';
const refreshSecret = () =>
  process.env.JWT_REFRESH_SECRET ||
  'your-super-secret-refresh-key-change-in-production-min-32-chars';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '15m';
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '7d';

export const generateAccessToken = (payload) => {
  return jwt.sign(payload, secret(), { expiresIn: JWT_EXPIRES_IN });
};

export const generateRefreshToken = (payload) => {
  return jwt.sign(payload, refreshSecret(), { expiresIn: JWT_REFRESH_EXPIRES_IN });
};

export const generateTokenPair = (user) => {
  const payload = {
    userId: user._id,
    email: user.email,
    role: user.role,
  };

  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken(payload);

  return { accessToken, refreshToken };
};

export const verifyAccessToken = (token) => {
  try {
    return jwt.verify(token, secret());
  } catch (error) {
    return null;
  }
};

export const verifyRefreshToken = (token) => {
  try {
    return jwt.verify(token, refreshSecret());
  } catch (error) {
    return null;
  }
};

export const decodeToken = (token) => {
  try {
    return jwt.decode(token);
  } catch (error) {
    return null;
  }
};

export const extractTokenFromHeader = (authHeader) => {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.split(' ')[1];
};

// Generate secure random token for email verification, password reset, etc.
export const generateSecureToken = (bytes = 32) => {
  return crypto.randomBytes(bytes).toString('hex');
};

// Hash token for storage
export const hashToken = (token) => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

export default {
  generateAccessToken,
  generateRefreshToken,
  generateTokenPair,
  verifyAccessToken,
  verifyRefreshToken,
  decodeToken,
  extractTokenFromHeader,
  generateSecureToken,
  hashToken,
};
