import winston from 'winston';
import fs from 'fs';
import path from 'path';
import { config } from '../config';

// Ensure logs directory exists
const logsDir = path.dirname(config.logsPath.info);
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Create different transports for different log levels
const setupLogging = () => {
  // File transports (for both dev and prod)
  const fileTransports = [
    new winston.transports.File({
      filename: config.logsPath.error,
      level: 'error',
    }),
    new winston.transports.File({
      filename: config.logsPath.warn,
      level: 'warn',
    }),
  ];

  // Add info log file only for dev mode
  if (config.isDev) {
    fileTransports.push(
      new winston.transports.File({
        filename: config.logsPath.info,
        level: 'info',
      })
    );
  }

  // Console transports - different based on environment
  const consoleTransport = new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    ),
    // In dev mode, log everything to console
    // In prod mode, only log warns and errors
    level: config.isDev ? 'info' : 'warn',
  });

  // Create the logger
  const logger = winston.createLogger({
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.json()
    ),
    transports: [...fileTransports, consoleTransport],
  });

  return logger;
};

export { setupLogging };
