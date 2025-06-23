import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import { config } from './config';
import apiRoutes from './api/routes';
import { setupLogging } from './utils/logger';
import { initializeRedis } from './services/redisService';
import { monitoringService } from './services/monitoringService';

// Initialize the Express application
const app = express();

// Set up middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Set up logging based on environment
const logger = setupLogging();

// Initialize Redis connection
initializeRedis()
  .then(() => logger.info('Redis connection established'))
  .catch(err => logger.error(`Redis connection error: ${err.message}`));

// Set up API routes
app.use('/api', apiRoutes);

// Start listening on the appropriate port
const PORT = config.isDev ? config.devPort : config.prodPort;
const server = app.listen(PORT, () => {
  logger.info(`Server running in ${config.environment} mode on port ${PORT}`);
});

// Set up real-time monitoring
monitoringService.startMonitoring();

// Handle graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
});
