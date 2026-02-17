import type { Database as BetterSqlite3Database, Statement } from 'better-sqlite3';

export interface DatabaseConfig {
  path: string;
  readonly?: boolean;
  fileMustExist?: boolean;
  timeout?: number;
  verbose?: boolean;
}

export interface Migration {
  id: string;
  name: string;
  up: string;
  down: string;
}

export interface MigrationRecord {
  id: string;
  name: string;
  appliedAt: Date;
}

export type QueryResult = {
  changes: number;
  lastInsertRowid: number | bigint;
};

export interface Repository<T> {
  findById(id: string): T | undefined;
  findAll(): T[];
  create(data: Omit<T, 'id'>): T;
  update(id: string, data: Partial<T>): T | undefined;
  delete(id: string): boolean;
  count(): number;
}

export interface DatabaseConnection {
  is_connected(): boolean;
  close(): void;
  get_db(): BetterSqlite3Database;
  execute(sql: string, params?: unknown[]): QueryResult;
  query<T>(sql: string, params?: unknown[]): T[];
  queryOne<T>(sql: string, params?: unknown[]): T | undefined;
  transaction<T>(fn: () => T): T;
}

export interface DatabaseOptions {
  config: DatabaseConfig;
  migrations?: Migration[];
  autoMigrate?: boolean;
}

export interface TableSchema {
  name: string;
  columns: ColumnSchema[];
  indexes?: IndexSchema[];
}

export interface ColumnSchema {
  name: string;
  type: 'TEXT' | 'INTEGER' | 'REAL' | 'BLOB' | 'NUMERIC';
  primaryKey?: boolean;
  notNull?: boolean;
  unique?: boolean;
  defaultValue?: unknown;
  autoIncrement?: boolean;
}

export interface IndexSchema {
  name: string;
  columns: string[];
  unique?: boolean;
}

export interface DatabaseStats {
  path: string;
  size: number;
  tables: number;
  migrations: number;
  lastMigration: Date | null;
}

export type DatabaseEvent = 'open' | 'close' | 'migration' | 'error';
export type DatabaseEventListener = (event: DatabaseEvent, data?: unknown) => void;