import winston from 'winston';
import fs from 'fs';
import path from 'path';
import {config} from '../config';

// Ensure logs directory exists
const logsDir = path.dirname(config.logsPath.info);
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Create different transports for different log levels
export const setupLogging = () => {
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

  // Console transport - different behavior for dev and prod
  // Dev: log all levels to console
  // Prod: log only warn and error to console
  const consoleTransport = new winston.transports.Console({
    level: config.isDev ? 'info' : 'warn',
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.timestamp(),
      winston.format.printf(({ timestamp, level, message }) => {
        return `${timestamp} ${level}: ${message}`;
      })
    ),
  });

  // Create logger
  return winston.createLogger({
    level: config.isDev ? 'info' : 'warn',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    defaultMeta: {service: 'railway-coaster'},
    transports: [...fileTransports, consoleTransport],
  });
};

export default setupLogging;
