import { config as dotenvConfig } from 'dotenv';
import type { ConfigOptions, ConfigLoadResult, ConfigSchema, ConfigValue, ConfigWatcher } from './types.js';

const loadedConfigs: Map<string, Record<string, unknown>> = new Map();

export function loadConfig(options: ConfigOptions): ConfigLoadResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const config: Record<string, unknown> = { ...options.defaults };

  for (const source of options.sources) {
    try {
      const sourceConfig = loadFromSource(source);
      Object.assign(config, sourceConfig);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error loading config source';
      errors.push(`Failed to load from ${source.type}: ${message}`);
    }
  }

  if (options.required) {
    for (const key of options.required) {
      if (config[key] === undefined) {
        errors.push(`Missing required config key: ${key}`);
      }
    }
  }

  if (options.validate) {
    const validationResult = options.validate(config);
    if (validationResult !== true) {
      const message = typeof validationResult === 'string' ? validationResult : 'Validation failed';
      errors.push(message);
    }
  }

  const cacheKey = JSON.stringify(options.sources);
  loadedConfigs.set(cacheKey, config);

  return {
    success: errors.length === 0,
    config,
    errors,
    warnings,
  };
}

function loadFromSource(source: ConfigOptions['sources'][0]): Record<string, unknown> {
  switch (source.type) {
    case 'env':
      return loadFromEnv(source.prefix);
    case 'file':
      return loadFromFile(source.path);
    case 'object':
      return {};
    default:
      return {};
  }
}

function loadFromEnv(prefix?: string): Record<string, unknown> {
  dotenvConfig();
  
  const config: Record<string, unknown> = {};
  const env = process.env;

  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined) {
      const configKey = prefix ? key.replace(new RegExp(`^${prefix}`), '') : key;
      if (!prefix || key.startsWith(prefix)) {
        config[configKey.toLowerCase()] = parseValue(value);
      }
    }
  }

  return config;
}

function loadFromFile(path?: string): Record<string, unknown> {
  if (!path) {
    throw new Error('File path is required for file source');
  }

  const { error } = dotenvConfig({ path });
  if (error) {
    throw error;
  }

  return loadFromEnv();
}

function parseValue(value: string): ConfigValue {
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null') return null;
  
  const num = Number(value);
  if (!isNaN(num)) return num;

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export function loadWithSchema(schema: ConfigSchema, options?: Partial<ConfigOptions>): ConfigLoadResult {
  const defaults: Record<string, unknown> = {};
  const required: string[] = [];

  for (const [key, def] of Object.entries(schema)) {
    if (def.default !== undefined) {
      defaults[key] = def.default;
    }
    if (def.required) {
      required.push(key);
    }
  }

  const result = loadConfig({
    sources: options?.sources ?? [{ type: 'env' }],
    required,
    defaults,
    ...options,
  });

  if (!result.success) {
    return result;
  }

  const transformedConfig: Record<string, unknown> = {};
  const errors: string[] = [];

  for (const [key, def] of Object.entries(schema)) {
    let value = result.config[key];

    if (value === undefined) {
      if (def.required) {
        errors.push(`Missing required config key: ${key}`);
      }
      continue;
    }

    if (typeof value === 'string' && def.transform) {
      value = def.transform(value);
    }

    if (def.validate && !def.validate(value as ConfigValue)) {
      errors.push(`Validation failed for config key: ${key}`);
    }

    transformedConfig[key] = value;
  }

  return {
    success: errors.length === 0,
    config: transformedConfig,
    errors,
    warnings: result.warnings,
  };
}

export function getLoadedConfig(cacheKey?: string): Record<string, unknown> | undefined {
  if (cacheKey) {
    return loadedConfigs.get(cacheKey);
  }
  const firstEntry = loadedConfigs.entries().next();
  return firstEntry.value?.[1];
}

export function clearLoadedConfigs(): void {
  loadedConfigs.clear();
}

export function createWatcher(options: ConfigOptions): ConfigWatcher {
  const callbacks: ((config: Record<string, unknown>) => void)[] = [];
  let intervalId: ReturnType<typeof setInterval> | null = null;

  return {
    start() {
      if (intervalId) return;
      
      intervalId = setInterval(() => {
        const result = loadConfig(options);
        if (result.success) {
          callbacks.forEach(cb => cb(result.config));
        }
      }, 5000);
    },
    stop() {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    },
    onChange(callback) {
      callbacks.push(callback);
    },
  };
}

export function getEnvVar(key: string, defaultValue?: ConfigValue): ConfigValue {
  const value = process.env[key];
  if (value === undefined) return defaultValue as ConfigValue;
  return parseValue(value);
}

export function requireEnvVar(key: string): string {
  const value = process.env[key];
  if (value === undefined) {
    throw new Error(`Required environment variable ${key} is not defined`);
  }
  return value;
}