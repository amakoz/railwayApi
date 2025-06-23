import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env file
dotenv.config();

const environment = process.env.NODE_ENV || 'development';
const isDev = environment === 'development';

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
    coasters: isDev
      ? path.join(__dirname, '../../src/data/dev/coasters.json')
      : path.join(__dirname, '../../src/data/prod/coasters.json'),
    wagons: isDev
      ? path.join(__dirname, '../../src/data/dev/wagons.json')
      : path.join(__dirname, '../../src/data/prod/wagons.json'),
  },
  logsPath: {
    error: path.join(__dirname, '../../logs/error.log'),
    warn: path.join(__dirname, '../../logs/warn.log'),
    info: path.join(__dirname, '../../logs/info.log'),
  },
};
