import winston from 'winston';
import type {
  LogLevel,
  LoggerOptions,
  LoggerInstance,
  LoggerManager,
  LogMetadata,
} from './types.js';

const defaultLevel: LogLevel = 'info';
const loggers = new Map<string, LoggerInstance>();

const levelPriority: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  verbose: 4,
  debug: 5,
  silly: 6,
};

function createFormat(formatType: 'json' | 'simple' | 'combined' = 'json') {
  const { combine, timestamp, printf, json, colorize, simple } = winston.format;

  const customFormat = printf(({ level, message, timestamp, ...meta }) => {
    const metaStr = Object.keys(meta).length > 0 ? JSON.stringify(meta) : '';
    return `${timestamp} [${level}]: ${message} ${metaStr}`.trim();
  });

  switch (formatType) {
    case 'simple':
      return combine(colorize(), timestamp(), simple());
    case 'combined':
      return combine(timestamp(), customFormat);
    case 'json':
    default:
      return combine(timestamp(), json());
  }
}

function createWinstonLogger(name: string, options: LoggerOptions = {}): winston.Logger {
  const {
    level = defaultLevel,
    console: enableConsole = true,
    file,
    format = 'json',
    defaultMeta = {},
  } = options;

  const transports: winston.transports.StreamTransportInstance[] = [];

  if (enableConsole) {
    transports.push(
      new winston.transports.Console({
        level,
        format: format === 'json' ? createFormat('simple') : createFormat(format),
      })
    );
  }

  if (file) {
    transports.push(
      new winston.transports.File({
        filename: file,
        level,
        format: createFormat('json'),
      })
    );
  }

  return winston.createLogger({
    level,
    defaultMeta: { service: name, ...defaultMeta },
    transports,
  });
}

class LoggerWrapper implements LoggerInstance {
  private winston: winston.Logger;
  private contextMeta: LogMetadata;

  constructor(winston: winston.Logger, contextMeta: LogMetadata = {}) {
    this.winston = winston;
    this.contextMeta = contextMeta;
  }

  private log(level: LogLevel, message: string, meta?: LogMetadata): void {
    this.winston.log(level, message, { ...this.contextMeta, ...meta });
  }

  error(message: string, meta?: LogMetadata): void {
    this.log('error', message, meta);
  }

  warn(message: string, meta?: LogMetadata): void {
    this.log('warn', message, meta);
  }

  info(message: string, meta?: LogMetadata): void {
    this.log('info', message, meta);
  }

  http(message: string, meta?: LogMetadata): void {
    this.log('http', message, meta);
  }

  verbose(message: string, meta?: LogMetadata): void {
    this.log('verbose', message, meta);
  }

  debug(message: string, meta?: LogMetadata): void {
    this.log('debug', message, meta);
  }

  silly(message: string, meta?: LogMetadata): void {
    this.log('silly', message, meta);
  }

  child(meta: LogMetadata): LoggerInstance {
    return new LoggerWrapper(this.winston, { ...this.contextMeta, ...meta });
  }

  withContext(context: string): LoggerInstance {
    return this.child({ context });
  }
}

function createLogger(name: string, options: LoggerOptions = {}): LoggerInstance {
  const winstonLogger = createWinstonLogger(name, options);
  const logger = new LoggerWrapper(winstonLogger);
  loggers.set(name, logger);
  return logger;
}

function getLogger(name: string): LoggerInstance {
  const existing = loggers.get(name);
  if (existing) {
    return existing;
  }
  return createLogger(name);
}

function setDefaultLevel(level: LogLevel): void {
  (globalThis as { __ubotLogLevel?: LogLevel }).__ubotLogLevel = level;
}

function getDefaultLevel(): LogLevel {
  return (globalThis as { __ubotLogLevel?: LogLevel }).__ubotLogLevel ?? defaultLevel;
}

function getLoggers(): Map<string, LoggerInstance> {
  return new Map(loggers);
}

function clearLoggers(): void {
  loggers.clear();
}

const loggerManager: LoggerManager = {
  getLogger,
  createLogger,
  setDefaultLevel,
  getDefaultLevel,
  getLoggers,
  clearLoggers,
};

const defaultLogger = createLogger('ubot-core');

export {
  createLogger,
  getLogger,
  defaultLogger,
  loggerManager,
  setDefaultLevel,
  getDefaultLevel,
  getLoggers,
  clearLoggers,
};

export type { LogLevel, LoggerOptions, LoggerInstance, LoggerManager, LogMetadata } from './types.js';