import Database from 'better-sqlite3';
import type {
  DatabaseConfig,
  DatabaseConnection,
  DatabaseOptions,
  DatabaseStats,
  DatabaseEvent,
  DatabaseEventListener,
  Migration,
  MigrationRecord,
  QueryResult,
  TableSchema,
} from './types.js';

export class SQLiteDatabase implements DatabaseConnection {
  private db: Database.Database | null = null;
  private config: DatabaseConfig;
  private migrations: Migration[];
  private listeners: Map<DatabaseEvent, DatabaseEventListener[]> = new Map();

  constructor(options: DatabaseOptions) {
    this.config = options.config;
    this.migrations = options.migrations || [];
    
    this.connect();
    
    if (options.autoMigrate !== false && this.migrations.length > 0) {
      this.runMigrations();
    }
  }

  private connect(): void {
    try {
      this.db = new Database(this.config.path, {
        readonly: this.config.readonly,
        fileMustExist: this.config.fileMustExist,
        timeout: this.config.timeout || 5000,
        verbose: this.config.verbose ? console.log : undefined,
      });

      this.db.pragma('journal_mode = WAL');
      this.db.pragma('foreign_keys = ON');

      this.createMigrationsTable();
      this.emit('open', { path: this.config.path });
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  private createMigrationsTable(): void {
    this.db?.exec(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL
      )
    `);
  }

  private runMigrations(): void {
    if (!this.db) return;

    const applied = this.getAppliedMigrations();
    const appliedIds = new Set(applied.map(m => m.id));

    for (const migration of this.migrations) {
      if (!appliedIds.has(migration.id)) {
        this.db.exec(migration.up);
        
        const stmt = this.db.prepare(
          'INSERT INTO _migrations (id, name, applied_at) VALUES (?, ?, ?)'
        );
        stmt.run(migration.id, migration.name, new Date().toISOString());
        
        this.emit('migration', { id: migration.id, name: migration.name });
      }
    }
  }

  private getAppliedMigrations(): MigrationRecord[] {
    return this.query<MigrationRecord>('SELECT * FROM _migrations ORDER BY id');
  }

  is_connected(): boolean {
    return this.db !== null && this.db.open;
  }

  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.emit('close');
    }
  }

  get_db(): Database.Database {
    if (!this.db) {
      throw new Error('Database is not connected');
    }
    return this.db;
  }

  execute(sql: string, params: unknown[] = []): QueryResult {
    const stmt = this.get_db().prepare(sql);
    const result = stmt.run(...params) as Database.RunResult;
    return {
      changes: result.changes,
      lastInsertRowid: result.lastInsertRowid,
    };
  }

  query<T>(sql: string, params: unknown[] = []): T[] {
    const stmt = this.get_db().prepare(sql);
    return stmt.all(...params) as T[];
  }

  queryOne<T>(sql: string, params: unknown[] = []): T | undefined {
    const stmt = this.get_db().prepare(sql);
    return stmt.get(...params) as T | undefined;
  }

  transaction<T>(fn: () => T): T {
    return this.get_db().transaction(fn)();
  }

  on(event: DatabaseEvent, listener: DatabaseEventListener): void {
    const existing = this.listeners.get(event) || [];
    existing.push(listener);
    this.listeners.set(event, existing);
  }

  off(event: DatabaseEvent, listener: DatabaseEventListener): void {
    const existing = this.listeners.get(event) || [];
    const filtered = existing.filter(l => l !== listener);
    this.listeners.set(event, filtered);
  }

  private emit(event: DatabaseEvent, data?: unknown): void {
    const listeners = this.listeners.get(event) || [];
    for (const listener of listeners) {
      listener(event, data);
    }
  }

  getStats(): DatabaseStats {
    const tables = this.query<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != '_migrations'"
    );
    
    const migrations = this.getAppliedMigrations();
    const lastMigration = migrations.length > 0 
      ? migrations[migrations.length - 1].appliedAt 
      : null;

    let size = 0;
    try {
      const fs = require('fs');
      const stats = fs.statSync(this.config.path);
      size = stats.size;
    } catch {
      // File might not exist yet
    }

    return {
      path: this.config.path,
      size,
      tables: tables.length,
      migrations: migrations.length,
      lastMigration,
    };
  }

  createTable(schema: TableSchema): void {
    const columns = schema.columns.map(col => {
      let def = `${col.name} ${col.type}`;
      if (col.primaryKey) def += ' PRIMARY KEY';
      if (col.autoIncrement) def += ' AUTOINCREMENT';
      if (col.notNull) def += ' NOT NULL';
      if (col.unique) def += ' UNIQUE';
      if (col.defaultValue !== undefined) {
        def += ` DEFAULT ${typeof col.defaultValue === 'string' ? `'${col.defaultValue}'` : col.defaultValue}`;
      }
      return def;
    });

    const sql = `CREATE TABLE IF NOT EXISTS ${schema.name} (${columns.join(', ')})`;
    this.get_db().exec(sql);

    if (schema.indexes) {
      for (const index of schema.indexes) {
        const unique = index.unique ? 'UNIQUE' : '';
        const cols = index.columns.join(', ');
        this.get_db().exec(
          `CREATE ${unique} INDEX IF NOT EXISTS ${index.name} ON ${schema.name} (${cols})`
        );
      }
    }
  }

  dropTable(name: string): void {
    this.get_db().exec(`DROP TABLE IF EXISTS ${name}`);
  }

  tableExists(name: string): boolean {
    const result = this.queryOne<{ count: number }>(
      "SELECT count(*) as count FROM sqlite_master WHERE type='table' AND name=?",
      [name]
    );
    return result?.count === 1;
  }
}

export function createConnection(options: DatabaseOptions): DatabaseConnection {
  return new SQLiteDatabase(options);
}

export function createDefaultConfig(path?: string): DatabaseConfig {
  return {
    path: path || process.env.DATABASE_PATH || ':memory:',
    readonly: false,
    timeout: 5000,
    verbose: process.env.NODE_ENV === 'development',
  };
}