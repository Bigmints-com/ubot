/**
 * Logger Types
 * Type definitions for the logging system
 */

export type LogLevel = 'error' | 'warn' | 'info' | 'debug' | 'verbose';

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: Date;
  context?: string;
  meta?: Record<string, unknown>;
  error?: Error;
}

export interface LoggerConfig {
  level: LogLevel;
  context?: string;
  format?: 'json' | 'simple' | 'pretty';
  transports?: LogTransport[];
}

export interface LogTransport {
  log(entry: LogEntry): void | Promise<void>;
}

export interface LoggerInstance {
  error(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  debug(message: string, meta?: Record<string, unknown>): void;
  verbose(message: string, meta?: Record<string, unknown>): void;
  log(level: LogLevel, message: string, meta?: Record<string, unknown>): void;
  child(context: string): LoggerInstance;
  withContext(context: string): LoggerInstance;
}