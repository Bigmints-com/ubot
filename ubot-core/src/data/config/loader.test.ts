import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig, loadWithSchema, getLoadedConfig, clearLoadedConfigs, getEnvVar, requireEnvVar } from './loader';
import type { ConfigSchema } from './types';

describe('Config Loader', () => {
  beforeEach(() => {
    clearLoadedConfigs();
  });

  afterEach(() => {
    clearLoadedConfigs();
  });

  describe('loadConfig', () => {
    it('should load config from environment variables', () => {
      process.env.TEST_VAR = 'test_value';
      
      const result = loadConfig({
        sources: [{ type: 'env' }],
      });

      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);
      
      delete process.env.TEST_VAR;
    });

    it('should apply prefix filter when loading from env', () => {
      process.env.APP_NAME = 'ubot';
      process.env.OTHER_VAR = 'ignored';
      
      const result = loadConfig({
        sources: [{ type: 'env', prefix: 'APP_' }],
      });

      expect(result.success).toBe(true);
      expect(result.config['name']).toBe('ubot');
      expect(result.config['other_var']).toBeUndefined();
      
      delete process.env.APP_NAME;
      delete process.env.OTHER_VAR;
    });

    it('should validate required keys', () => {
      const result = loadConfig({
        sources: [{ type: 'env' }],
        required: ['MISSING_KEY'],
      });

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Missing required config key: MISSING_KEY');
    });

    it('should apply defaults', () => {
      const result = loadConfig({
        sources: [{ type: 'env' }],
        defaults: { defaultKey: 'defaultValue' },
      });

      expect(result.config.defaultKey).toBe('defaultValue');
    });

    it('should run custom validation', () => {
      const result = loadConfig({
        sources: [{ type: 'env' }],
        validate: () => 'Custom validation error',
      });

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Custom validation error');
    });
  });

  describe('loadWithSchema', () => {
    it('should load and transform config with schema', () => {
      process.env.PORT = '3000';
      process.env.DEBUG = 'true';

      const schema: ConfigSchema = {
        port: {
          type: 'number',
          required: true,
          transform: (v) => parseInt(v, 10),
        },
        debug: {
          type: 'boolean',
          default: false,
        },
      };

      const result = loadWithSchema(schema);

      expect(result.success).toBe(true);
      expect(result.config.port).toBe(3000);
      expect(result.config.debug).toBe(true);

      delete process.env.PORT;
      delete process.env.DEBUG;
    });

    it('should use default values from schema', () => {
      const schema: ConfigSchema = {
        timeout: {
          type: 'number',
          default: 5000,
        },
      };

      const result = loadWithSchema(schema);

      expect(result.config.timeout).toBe(5000);
    });

    it('should validate with schema validators', () => {
      process.env.PORT = 'invalid';

      const schema: ConfigSchema = {
        port: {
          type: 'number',
          required: true,
          validate: (v) => typeof v === 'number' && v > 0,
        },
      };

      const result = loadWithSchema(schema);

      expect(result.success).toBe(false);

      delete process.env.PORT;
    });
  });

  describe('getEnvVar', () => {
    it('should return environment variable value', () => {
      process.env.TEST_KEY = 'test_value';
      expect(getEnvVar('TEST_KEY')).toBe('test_value');
      delete process.env.TEST_KEY;
    });

    it('should return default value when env var is not set', () => {
      expect(getEnvVar('NONEXISTENT_KEY', 'default')).toBe('default');
    });

    it('should parse boolean values', () => {
      process.env.BOOL_TRUE = 'true';
      process.env.BOOL_FALSE = 'false';
      
      expect(getEnvVar('BOOL_TRUE')).toBe(true);
      expect(getEnvVar('BOOL_FALSE')).toBe(false);
      
      delete process.env.BOOL_TRUE;
      delete process.env.BOOL_FALSE;
    });

    it('should parse numeric values', () => {
      process.env.NUM_VAL = '42';
      expect(getEnvVar('NUM_VAL')).toBe(42);
      delete process.env.NUM_VAL;
    });
  });

  describe('requireEnvVar', () => {
    it('should return value when env var exists', () => {
      process.env.REQUIRED_VAR = 'value';
      expect(requireEnvVar('REQUIRED_VAR')).toBe('value');
      delete process.env.REQUIRED_VAR;
    });

    it('should throw when env var is missing', () => {
      expect(() => requireEnvVar('MISSING_REQUIRED_VAR')).toThrow(
        'Required environment variable MISSING_REQUIRED_VAR is not defined'
      );
    });
  });

  describe('config caching', () => {
    it('should cache loaded configs', () => {
      process.env.CACHED_VAR = 'cached';
      
      loadConfig({
        sources: [{ type: 'env' }],
      });

      const cached = getLoadedConfig();
      expect(cached).toBeDefined();
      expect(cached?.['cached_var']).toBe('cached');
      
      delete process.env.CACHED_VAR;
    });

    it('should clear all cached configs', () => {
      process.env.TO_CLEAR = 'value';
      
      loadConfig({
        sources: [{ type: 'env' }],
      });

      clearLoadedConfigs();
      expect(getLoadedConfig()).toBeUndefined();
      
      delete process.env.TO_CLEAR;
    });
  });
});