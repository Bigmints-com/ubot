import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createLogger,
  getLogger,
  loggerManager,
  setDefaultLevel,
  getDefaultLevel,
  getLoggers,
  clearLoggers,
} from './index.js';
import type { LogLevel, LoggerInstance } from './types.js';

describe('Logger', () => {
  beforeEach(() => {
    clearLoggers();
  });

  afterEach(() => {
    clearLoggers();
  });

  describe('createLogger', () => {
    it('should create a logger with default options', () => {
      const logger = createLogger('test-logger');
      expect(logger).toBeDefined();
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.error).toBe('function');
      expect(typeof logger.debug).toBe('function');
    });

    it('should create a logger with custom level', () => {
      const logger = createLogger('debug-logger', { level: 'debug' });
      expect(logger).toBeDefined();
    });

    it('should create a logger with default metadata', () => {
      const logger = createLogger('meta-logger', {
        defaultMeta: { service: 'test-service' },
      });
      expect(logger).toBeDefined();
    });
  });

  describe('getLogger', () => {
    it('should return existing logger if already created', () => {
      const logger1 = createLogger('shared-logger');
      const logger2 = getLogger('shared-logger');
      expect(logger1).toBe(logger2);
    });

    it('should create new logger if not exists', () => {
      const logger = getLogger('new-logger');
      expect(logger).toBeDefined();
    });
  });

  describe('LoggerInstance', () => {
    let logger: LoggerInstance;

    beforeEach(() => {
      logger = createLogger('test', { level: 'debug' });
    });

    it('should log error messages', () => {
      expect(() => logger.error('Test error message')).not.toThrow();
    });

    it('should log warn messages', () => {
      expect(() => logger.warn('Test warn message')).not.toThrow();
    });

    it('should log info messages', () => {
      expect(() => logger.info('Test info message')).not.toThrow();
    });

    it('should log http messages', () => {
      expect(() => logger.http('Test http message')).not.toThrow();
    });

    it('should log verbose messages', () => {
      expect(() => logger.verbose('Test verbose message')).not.toThrow();
    });

    it('should log debug messages', () => {
      expect(() => logger.debug('Test debug message')).not.toThrow();
    });

    it('should log silly messages', () => {
      expect(() => logger.silly('Test silly message')).not.toThrow();
    });

    it('should log with metadata', () => {
      expect(() =>
        logger.info('Test message with metadata', { userId: '123', action: 'test' })
      ).not.toThrow();
    });

    it('should create child logger with additional metadata', () => {
      const childLogger = logger.child({ requestId: 'req-123' });
      expect(childLogger).toBeDefined();
      expect(() => childLogger.info('Child logger message')).not.toThrow();
    });

    it('should create context logger', () => {
      const contextLogger = logger.withContext('TestContext');
      expect(contextLogger).toBeDefined();
      expect(() => contextLogger.info('Context logger message')).not.toThrow();
    });
  });

  describe('loggerManager', () => {
    it('should manage multiple loggers', () => {
      const logger1 = loggerManager.createLogger('manager-test-1');
      const logger2 = loggerManager.createLogger('manager-test-2');

      const allLoggers = loggerManager.getLoggers();
      expect(allLoggers.has('manager-test-1')).toBe(true);
      expect(allLoggers.has('manager-test-2')).toBe(true);
    });

    it('should clear all loggers', () => {
      loggerManager.createLogger('clear-test-1');
      loggerManager.createLogger('clear-test-2');

      loggerManager.clearLoggers();
      const allLoggers = loggerManager.getLoggers();
      expect(allLoggers.size).toBe(0);
    });

    it('should set and get default level', () => {
      const newLevel: LogLevel = 'debug';
      loggerManager.setDefaultLevel(newLevel);
      expect(loggerManager.getDefaultLevel()).toBe(newLevel);
    });
  });

  describe('log levels', () => {
    it('should respect log level priority', () => {
      const errorLogger = createLogger('error-only', { level: 'error' });
      expect(() => errorLogger.error('Should log')).not.toThrow();
      expect(() => errorLogger.info('Should not log but not throw')).not.toThrow();
    });
  });
});