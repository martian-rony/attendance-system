import './config/env.js'; // must be first: loads dotenv + env defaults
import app from './app.js';
import { connectDB } from './config/database.js';
import { logger } from './utils/logger.js';
import { initializeSocket } from './socket/handlers.js';
import http from 'http';

const PORT = process.env.PORT || 5000;

const server = http.createServer(app);

// Initialize Socket.io
initializeSocket(server);

const startServer = async () => {
  try {
    // Connect to MongoDB
    await connectDB();

    server.listen(PORT, () => {
      logger.info(
        `Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`
      );
      logger.info(`API available at http://localhost:${PORT}/api`);
      logger.info(`Health check at http://localhost:${PORT}/health`);
    });
  } catch (error) {
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
