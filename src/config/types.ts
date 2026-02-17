export interface ConfigSource {
  type: 'env' | 'file' | 'object';
  path?: string;
  prefix?: string;
}

export interface ConfigOptions {
  sources: ConfigSource[];
  required?: string[];
  defaults?: Record<string, unknown>;
  validate?: (config: Record<string, unknown>) => boolean | string;
}

export interface ConfigLoadResult {
  success: boolean;
  config: Record<string, unknown>;
  errors: string[];
  warnings: string[];
}

export interface ConfigWatcher {
  start(): void;
  stop(): void;
  onChange(callback: (config: Record<string, unknown>) => void): void;
}

export type ConfigValue = string | number | boolean | null | undefined;

export interface ConfigSchema {
  [key: string]: {
    type: 'string' | 'number' | 'boolean' | 'json';
    required?: boolean;
    default?: ConfigValue;
    transform?: (value: string) => ConfigValue;
    validate?: (value: ConfigValue) => boolean;
  };
}