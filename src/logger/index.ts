/**
 * Logger Module
 * Winston-based logging implementation
 */

import winston from 'winston';
import type { LoggerInstance, LoggerConfig, LogLevel, LogEntry } from './types.js';

const LEVELS: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
  verbose: 4,
};

class WinstonLogger implements LoggerInstance {
  private logger: winston.Logger;
  private context?: string;

  constructor(config: LoggerConfig) {
    const level = config.level || 'info';
    const format = config.format || 'simple';

    const transports: winston.transport[] = [
      new winston.transports.Console({
        format:
          format === 'json'
            ? winston.format.json()
            : winston.format.combine(
                winston.format.timestamp(),
                winston.format.printf(({ level, message, timestamp, ...meta }) => {
                  const ctx = this.context ? `[${this.context}] ` : '';
                  return `${timestamp} [${level}]: ${ctx}${message} ${
                    Object.keys(meta).length ? JSON.stringify(meta) : ''
                  }`;
                })
              ),
      }),
    ];

    if (config.transports) {
      config.transports.forEach((transport) => {
        transports.push({
          log: (info: winston.LogEntry, callback: () => void) => {
            transport.log({
              level: info.level as LogLevel,
              message: info.message,
              timestamp: new Date(),
              context: this.context,
              meta: info.meta as Record<string, unknown>,
            });
            callback();
          },
        } as unknown as winston.transport);
      });
    }

    this.logger = winston.createLogger({
      levels: LEVELS,
      level,
      transports,
    });

    this.context = config.context;
  }

  error(message: string, meta?: Record<string, unknown>): void {
    this.logger.error(message, { context: this.context, ...meta });
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    this.logger.warn(message, { context: this.context, ...meta });
  }

  info(message: string, meta?: Record<string, unknown>): void {
    this.logger.info(message, { context: this.context, ...meta });
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    this.logger.debug(message, { context: this.context, ...meta });
  }

  verbose(message: string, meta?: Record<string, unknown>): void {
    this.logger.verbose(message, { context: this.context, ...meta });
  }

  log(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
    this.logger.log(level, message, { context: this.context, ...meta });
  }

  child(context: string): LoggerInstance {
    const childContext = this.context ? `${this.context}:${context}` : context;
    return new WinstonLogger({
      level: this.logger.level as LogLevel,
      context: childContext,
    });
  }

  withContext(context: string): LoggerInstance {
    return this.child(context);
  }
}

/**
 * Create a new logger instance
 */
export function createLogger(config?: Partial<LoggerConfig>): LoggerInstance {
  return new WinstonLogger({
    level: config?.level || 'info',
    context: config?.context,
    format: config?.format,
    transports: config?.transports,
  });
}

/**
 * Default logger instance
 */
let defaultLogger: LoggerInstance | undefined;

/**
 * Get the default logger instance
 */
export function getLogger(): LoggerInstance {
  if (!defaultLogger) {
    defaultLogger = createLogger({ level: 'info' });
  }
  return defaultLogger;
}

/**
 * Set the default logger instance
 */
export function setLogger(logger: LoggerInstance): void {
  defaultLogger = logger;
}

export type { LoggerInstance, LoggerConfig, LogLevel, LogEntry, LogTransport } from './types.js';