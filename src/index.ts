import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import { config } from './config';
import apiRoutes from './api/routes';
import { setupLogging } from './utils/logger';
import { initializeRedis, cleanupRedis } from './services/redisService';
import { monitoringService } from './services/monitoringService';
import { initDataService } from './services/dataService';

// Initialize the Express application
const app = express();

// Set up middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Set up logging based on environment
const logger = setupLogging();

// Initialize services
const initializeServices = async () => {
  try {
    // Initialize Redis connection
    await initializeRedis()
      .then(() => logger.info('Redis connection established'))
      .catch(err => logger.error(`Redis connection error: ${err.message}`));

    // Initialize data service
    initDataService();

    logger.info('All services initialized successfully');
  } catch (error) {
    logger.error(`Error initializing services: ${error}`);
    logger.warn('The system will operate in standalone mode');
  }
};

// Initialize all services
initializeServices();

// Set up API routes
app.use('/api', apiRoutes);

// Start listening on the appropriate port
const PORT = config.isDev ? config.devPort : config.prodPort;
const server = app.listen(PORT, () => {
  logger.info(`Server running in ${config.environment} mode on port ${PORT}`);
  logger.info(`Developer mode: ${config.isDev ? 'ENABLED' : 'DISABLED'}`);
  logger.info(`API accessible at http://localhost:${PORT}/api`);
});

// Set up real-time monitoring
monitoringService.startMonitoring();

// Handle graceful shutdown
const handleShutdown = async () => {
  logger.info('Shutdown signal received: closing HTTP server and services');

  try {
    // Cleanup Redis connections
    await cleanupRedis();

    server.close(() => {
      logger.info('HTTP server closed');
      process.exit(0);
    });

    // Force exit after 5 seconds if the server is hanging
    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 5000);
  } catch (error) {
    logger.error(`Error during shutdown: ${error}`);
    process.exit(1);
  }
};

// Register shutdown handlers
process.on('SIGTERM', handleShutdown);
process.on('SIGINT', handleShutdown);
