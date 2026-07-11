import nodemailer from 'nodemailer';
import { logger } from './logger.js';

// SMTP configuration via environment variables (Gmail example):
//   EMAIL_HOST=smtp.gmail.com
//   EMAIL_PORT=465
//   EMAIL_SECURE=true
//   EMAIL_USER=you@gmail.com
//   EMAIL_PASS=your-16-char-app-password
//   EMAIL_FROM="Attendance System <you@gmail.com>"
const isEmailConfigured = () =>
  Boolean(process.env.EMAIL_HOST && process.env.EMAIL_USER && process.env.EMAIL_PASS);

let transporter = null;

const getTransporter = () => {
  if (transporter) return transporter;
  if (!isEmailConfigured()) return null;

  transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: parseInt(process.env.EMAIL_PORT, 10) || 587,
    secure: process.env.EMAIL_SECURE === 'true' || process.env.EMAIL_PORT === '465',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
  return transporter;
};

// Base URL of the frontend (the SPA). Prefer CLIENT_URL; fall back to the
// Render external URL (auto-set by env.js), then localhost for dev.
export const getClientUrl = () => {
  if (process.env.CLIENT_URL) return process.env.CLIENT_URL.replace(/\/$/, '');
  if (process.env.RENDER_EXTERNAL_URL)
    return process.env.RENDER_EXTERNAL_URL.replace(/\/$/, '');
  return 'http://localhost:5000';
};

/**
 * Send an email. If SMTP is not configured (e.g. local dev without creds),
 * it logs the would-be email instead of throwing — so the app never crashes
 * on a missing mail provider.
 */
export const sendEmail = async ({ to, subject, text, html }) => {
  const from = process.env.EMAIL_FROM || process.env.EMAIL_USER || 'Attendance System';

  if (!isEmailConfigured()) {
    logger.warn(
      `Email not sent (SMTP not configured). Would have sent to ${to}: "${subject}"`
    );
    return { sent: false, reason: 'not-configured' };
  }

  const mailTransporter = getTransporter();
  try {
    const info = await mailTransporter.sendMail({
      from,
      to,
      subject,
      text,
      html: html || text,
    });
    logger.info(`Email sent to ${to}: ${subject} (${info.messageId})`);
    return { sent: true, messageId: info.messageId };
  } catch (err) {
    logger.error(`Failed to send email to ${to}: ${err.message}`);
    // Do not crash the request — password reset etc. should still resolve.
    return { sent: false, reason: err.message };
  }
};

export { isEmailConfigured };
