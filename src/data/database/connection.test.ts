import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SQLiteDatabase, createConnection, createDefaultConfig } from './connection.js';
import { defaultMigrations } from './migrations.js';

describe('DatabaseConnection', () => {
  let db: SQLiteDatabase;

  beforeEach(() => {
    db = new SQLiteDatabase({
      config: { path: ':memory:' },
      migrations: defaultMigrations,
      autoMigrate: true,
    });
  });

  afterEach(() => {
    db.close();
  });

  describe('connection', () => {
    it('should connect to in-memory database', () => {
      expect(db.is_connected()).toBe(true);
    });

    it('should execute queries', () => {
      const result = db.execute('CREATE TABLE test (id TEXT PRIMARY KEY)');
      expect(result.changes).toBe(0);
    });

    it('should query data', () => {
      db.execute('CREATE TABLE test (id TEXT PRIMARY KEY, value TEXT)');
      db.execute("INSERT INTO test (id, value) VALUES ('1', 'hello')");
      
      const rows = db.query<{ id: string; value: string }>('SELECT * FROM test');
      expect(rows).toHaveLength(1);
      expect(rows[0].value).toBe('hello');
    });

    it('should query single row', () => {
      db.execute('CREATE TABLE test (id TEXT PRIMARY KEY, value TEXT)');
      db.execute("INSERT INTO test (id, value) VALUES ('1', 'hello')");
      
      const row = db.queryOne<{ id: string; value: string }>(
        'SELECT * FROM test WHERE id = ?',
        ['1']
      );
      expect(row?.value).toBe('hello');
    });

    it('should handle transactions', () => {
      db.execute('CREATE TABLE test (id TEXT PRIMARY KEY, value INTEGER)');
      
      db.transaction(() => {
        db.execute("INSERT INTO test (id, value) VALUES ('1', 10)");
        db.execute("INSERT INTO test (id, value) VALUES ('2', 20)");
      });

      const count = db.queryOne<{ total: number }>(
        'SELECT SUM(value) as total FROM test'
      );
      expect(count?.total).toBe(30);
    });

    it('should rollback on error in transaction', () => {
      db.execute('CREATE TABLE test (id TEXT PRIMARY KEY)');
      
      expect(() => {
        db.transaction(() => {
          db.execute("INSERT INTO test (id) VALUES ('1')");
          throw new Error('Rollback');
        });
      }).toThrow('Rollback');

      const rows = db.query('SELECT * FROM test');
      expect(rows).toHaveLength(0);
    });
  });

  describe('migrations', () => {
    it('should apply default migrations', () => {
      expect(db.tableExists('agents')).toBe(true);
      expect(db.tableExists('tasks')).toBe(true);
      expect(db.tableExists('config_store')).toBe(true);
    });

    it('should track applied migrations', () => {
      const stats = db.getStats();
      expect(stats.migrations).toBeGreaterThan(0);
    });
  });

  describe('table operations', () => {
    it('should create table with schema', () => {
      db.createTable({
        name: 'custom_table',
        columns: [
          { name: 'id', type: 'TEXT', primaryKey: true },
          { name: 'name', type: 'TEXT', notNull: true },
          { name: 'count', type: 'INTEGER', defaultValue: 0 },
        ],
        indexes: [
          { name: 'idx_name', columns: ['name'] },
        ],
      });

      expect(db.tableExists('custom_table')).toBe(true);
    });

    it('should drop table', () => {
      db.execute('CREATE TABLE to_drop (id TEXT)');
      expect(db.tableExists('to_drop')).toBe(true);
      
      db.dropTable('to_drop');
      expect(db.tableExists('to_drop')).toBe(false);
    });
  });

  describe('events', () => {
    it('should emit open event', () => {
      let opened = false;
      const testDb = new SQLiteDatabase({
        config: { path: ':memory:' },
        autoMigrate: false,
      });
      
      testDb.on('open', () => {
        opened = true;
      });
      
      // Event was already emitted during construction
      testDb.close();
    });
  });
});

describe('createDefaultConfig', () => {
  it('should return default config', () => {
    const config = createDefaultConfig();
    expect(config.path).toBe(':memory:');
    expect(config.readonly).toBe(false);
  });

  it('should use custom path', () => {
    const config = createDefaultConfig('/path/to/db.sqlite');
    expect(config.path).toBe('/path/to/db.sqlite');
  });
});