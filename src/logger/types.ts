```typescript
/**
 * Logger types for ubot-core
 */

export type LogLevel = 'error' | 'warn' | 'info' | 'debug' | 'trace';

export interface LoggerInstance {
  error(message: string, ...args: unknown[]): void;
  error(object: Record<string, unknown>, message?: string): void;
  warn(message: string, ...args: unknown[]): void;
  warn(object: Record<string, unknown>, message?: string): void;
  info(message: string, ...args: unknown[]): void;
  info(object: Record<string, unknown>, message?: string): void;
  debug(message: string, ...args: unknown[]): void;
  debug(object: Record<string, unknown>, message?: string): void;
  trace(message: string, ...args: unknown[]): void;
  trace(object: Record<string, unknown>, message?: string): void;
  child(bindings: Record<string, unknown>): LoggerInstance;
}

export interface LoggerConfig {
  level: LogLevel;
  name?: string;
  prettyPrint?: boolean;
}
```