export type LogLevel = 'error' | 'warn' | 'info' | 'http' | 'verbose' | 'debug' | 'silly';

export interface LogMetadata {
  [key: string]: unknown;
}

export interface LoggerOptions {
  level?: LogLevel;
  console?: boolean;
  file?: string;
  format?: 'json' | 'simple' | 'combined';
  defaultMeta?: LogMetadata;
}

export interface LoggerInstance {
  error(message: string, meta?: LogMetadata): void;
  warn(message: string, meta?: LogMetadata): void;
  info(message: string, meta?: LogMetadata): void;
  http(message: string, meta?: LogMetadata): void;
  verbose(message: string, meta?: LogMetadata): void;
  debug(message: string, meta?: LogMetadata): void;
  silly(message: string, meta?: LogMetadata): void;
  child(meta: LogMetadata): LoggerInstance;
  withContext(context: string): LoggerInstance;
}

export interface LoggerManager {
  getLogger(name: string): LoggerInstance;
  createLogger(name: string, options?: LoggerOptions): LoggerInstance;
  setDefaultLevel(level: LogLevel): void;
  getDefaultLevel(): LogLevel;
  getLoggers(): Map<string, LoggerInstance>;
  clearLoggers(): void;
}