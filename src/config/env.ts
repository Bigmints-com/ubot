import dotenv from 'dotenv';
import type { AppConfig } from './types.js';

dotenv.config();

export const config: AppConfig = {
  port: parseInt(process.env.PORT || '3100', 10),
  dbPath: process.env.DB_PATH || './data/ubot.db',
  nodeEnv: process.env.NODE_ENV || 'development',
};

export type { AppConfig };