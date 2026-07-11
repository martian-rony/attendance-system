import './config/env.js'; // must be first: loads dotenv + env defaults
import app from './app.js';
import { connectDB } from './config/database.js';
import { logger } from './utils/logger.js';
import { initializeSocket } from './socket/handlers.js';
import { seedDatabase } from './scripts/seed.js';
import User from './models/User.js';
import http from 'http';

const PORT = process.env.PORT || 5000;

const server = http.createServer(app);

// Initialize Socket.io
initializeSocket(server);

// Seed demo data on first boot when the DB is empty (single-service deploy
// with no manual seed step). Skipped in development to avoid clobbering local
// data, and only runs when there are zero users so it's idempotent.
const maybeSeed = async () => {
  if (process.env.NODE_ENV === 'development') return;
  try {
    const count = await User.estimatedDocumentCount();
    if (count === 0) {
      logger.info('No users found — seeding demo data...');
      await seedDatabase();
    }
  } catch (err) {
    logger.error('Auto-seed skipped (will retry next boot):', err.message);
  }
};

const startServer = async () => {
  try {
    // Connect to MongoDB
    await connectDB();

    await maybeSeed();

    server.listen(PORT, () => {
      logger.info(
        `Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`
      );
      logger.info(`API available at http://localhost:${PORT}/api`);
      logger.info(`Health check at http://localhost:${PORT}/health`);
    });
  } catch (error) {
    // Use console.error directly so the failure is always visible on the
    // host (Render captures stderr) even if the logger transport doesn't flush
    // before process.exit.
    // eslint-disable-next-line no-console
    console.error('Failed to start server:', error);
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received. Shutting down gracefully...');
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });

  // Force close after 10 seconds
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received. Shutting down gracefully...');
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

startServer();

export { server };
