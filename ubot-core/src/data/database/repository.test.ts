import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SQLiteDatabase } from './connection.js';
import { BaseRepository, BaseEntity } from './repository.js';
import { defaultMigrations } from './migrations.js';

interface TestEntity extends BaseEntity {
  name: string;
  value: number;
}

describe('BaseRepository', () => {
  let db: SQLiteDatabase;
  let repo: BaseRepository<TestEntity>;

  beforeEach(() => {
    db = new SQLiteDatabase({
      config: { path: ':memory:' },
      migrations: defaultMigrations,
      autoMigrate: true,
    });

    db.execute(`
      CREATE TABLE test_entities (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        value INTEGER NOT NULL,
        created_at TEXT,
        updated_at TEXT
      )
    `);

    repo = new BaseRepository<TestEntity>(db, 'test_entities', [
      'id', 'name', 'value', 'created_at', 'updated_at'
    ]);
  });

  afterEach(() => {
    db.close();
  });

  describe('CRUD operations', () => {
    it('should create entity', () => {
      const entity = repo.create({ name: 'Test', value: 42 });
      
      expect(entity.id).toBeDefined();
      expect(entity.name).toBe('Test');
      expect(entity.value).toBe(42);
      expect(entity.created_at).toBeDefined();
      expect(entity.updated_at).toBeDefined();
    });

    it('should find by id', () => {
      const created = repo.create({ name: 'Test', value: 42 });
      const found = repo.findById(created.id);
      
      expect(found).toEqual(created);
    });

    it('should return undefined for non-existent id', () => {
      const found = repo.findById('non-existent');
      expect(found).toBeUndefined();
    });

    it('should find all', () => {
      repo.create({ name: 'Test 1', value: 1 });
      repo.create({ name: 'Test 2', value: 2 });
      
      const all = repo.findAll();
      expect(all).toHaveLength(2);
    });

    it('should update entity', () => {
      const created = repo.create({ name: 'Test', value: 42 });
      const updated = repo.update(created.id, { value: 100 });
      
      expect(updated?.value).toBe(100);
      expect(updated?.name).toBe('Test');
    });

    it('should return undefined when updating non-existent', () => {
      const updated = repo.update('non-existent', { value: 100 });
      expect(updated).toBeUndefined();
    });

    it('should delete entity', () => {
      const created = repo.create({ name: 'Test', value: 42 });
      
      const deleted = repo.delete(created.id);
      expect(deleted).toBe(true);
      
      const found = repo.findById(created.id);
      expect(found).toBeUndefined();
    });

    it('should return false when deleting non-existent', () => {
      const deleted = repo.delete('non-existent');
      expect(deleted).toBe(false);
    });

    it('should count entities', () => {
      expect(repo.count()).toBe(0);
      
      repo.create({ name: 'Test 1', value: 1 });
      repo.create({ name: 'Test 2', value: 2 });
      
      expect(repo.count()).toBe(2);
    });
  });

  describe('query helpers', () => {
    it('should find where', () => {
      repo.create({ name: 'Test 1', value: 1 });
      repo.create({ name: 'Test 2', value: 2 });
      repo.create({ name: 'Test 1', value: 3 });
      
      const results = repo.findWhere({ name: 'Test 1' });
      expect(results).toHaveLength(2);
    });

    it('should find one where', () => {
      repo.create({ name: 'Test', value: 1 });
      repo.create({ name: 'Test', value: 2 });
      
      const result = repo.findOneWhere({ name: 'Test' });
      expect(result?.name).toBe('Test');
    });

    it('should check existence', () => {
      const created = repo.create({ name: 'Test', value: 42 });
      
      expect(repo.exists(created.id)).toBe(true);
      expect(repo.exists('non-existent')).toBe(false);
    });
  });

  describe('transactions', () => {
    it('should wrap operations in transaction', () => {
      const entity = repo.transaction(() => {
        const e = repo.create({ name: 'Test', value: 42 });
        repo.update(e.id, { value: 100 });
        return repo.findById(e.id);
      });

      expect(entity?.value).toBe(100);
    });
  });
});