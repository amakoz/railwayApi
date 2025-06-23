import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Load environment variables from .env file
dotenv.config();

const environment = process.env.NODE_ENV || 'development';
const isDev = environment === 'development';

// Docker environment detection - more robust check:
// If DOCKER_ENV is set OR if we're in a container (check for .dockerenv file)
const isDocker = process.env.DOCKER_ENV === 'true' || fs.existsSync('/.dockerenv');

// Configuration object
export const config = {
  environment,
  isDev,
  devPort: 3050,
  prodPort: 3051,
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
  },
  dataPath: {
    // Use different paths for development and production to prevent data collision
    // In Docker environment, use absolute paths from the app root
    coasters: isDev
      ? path.join(__dirname, '../../src/data/dev/coasters.json')
      : isDocker
        ? '/app/data/prod/coasters.json'
        : path.join(__dirname, '../../src/data/prod/coasters.json'),
    wagons: isDev
      ? path.join(__dirname, '../../src/data/dev/wagons.json')
      : isDocker
        ? '/app/data/prod/wagons.json'
        : path.join(__dirname, '../../src/data/prod/wagons.json'),
  },
  logsPath: {
    error: path.join(__dirname, '../../logs/error.log'),
    warn: path.join(__dirname, '../../logs/warn.log'),
    info: path.join(__dirname, '../../logs/info.log'),
  },
};
