import { v4 as uuidv4 } from 'uuid';
import type { Repository, DatabaseConnection } from './types.js';

export interface BaseEntity {
  id: string;
  created_at?: string;
  updated_at?: string;
}

export class BaseRepository<T extends BaseEntity> implements Repository<T> {
  protected db: DatabaseConnection;
  protected tableName: string;
  protected columns: string[];

  constructor(db: DatabaseConnection, tableName: string, columns: string[]) {
    this.db = db;
    this.tableName = tableName;
    this.columns = columns;
  }

  findById(id: string): T | undefined {
    return this.db.queryOne<T>(
      `SELECT * FROM ${this.tableName} WHERE id = ?`,
      [id]
    );
  }

  findAll(): T[] {
    return this.db.query<T>(`SELECT * FROM ${this.tableName}`);
  }

  create(data: Omit<T, 'id'>): T {
    const id = uuidv4();
    const now = new Date().toISOString();
    
    const record = {
      ...data,
      id,
      created_at: now,
      updated_at: now,
    } as T;

    const columns = Object.keys(record);
    const placeholders = columns.map(() => '?').join(', ');
    const values = columns.map(col => (record as Record<string, unknown>)[col]);

    this.db.execute(
      `INSERT INTO ${this.tableName} (${columns.join(', ')}) VALUES (${placeholders})`,
      values
    );

    return record;
  }

  update(id: string, data: Partial<T>): T | undefined {
    const now = new Date().toISOString();
    const updateData = {
      ...data,
      updated_at: now,
    };

    const columns = Object.keys(updateData);
    const setClause = columns.map(col => `${col} = ?`).join(', ');
    const values = columns.map(col => (updateData as Record<string, unknown>)[col]);
    values.push(id);

    this.db.execute(
      `UPDATE ${this.tableName} SET ${setClause} WHERE id = ?`,
      values
    );

    return this.findById(id);
  }

  delete(id: string): boolean {
    const result = this.db.execute(
      `DELETE FROM ${this.tableName} WHERE id = ?`,
      [id]
    );
    return result.changes > 0;
  }

  count(): number {
    const result = this.db.queryOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM ${this.tableName}`
    );
    return result?.count || 0;
  }

  findWhere(conditions: Partial<T>): T[] {
    const columns = Object.keys(conditions);
    if (columns.length === 0) return this.findAll();

    const whereClause = columns.map(col => `${col} = ?`).join(' AND ');
    const values = columns.map(col => (conditions as Record<string, unknown>)[col]);

    return this.db.query<T>(
      `SELECT * FROM ${this.tableName} WHERE ${whereClause}`,
      values
    );
  }

  findOneWhere(conditions: Partial<T>): T | undefined {
    const results = this.findWhere(conditions);
    return results[0];
  }

  exists(id: string): boolean {
    const result = this.db.queryOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM ${this.tableName} WHERE id = ?`,
      [id]
    );
    return (result?.count || 0) > 0;
  }

  transaction<R>(fn: () => R): R {
    return this.db.transaction(fn);
  }
}

export function createRepository<T extends BaseEntity>(
  db: DatabaseConnection,
  tableName: string,
  columns: string[]
): Repository<T> {
  return new BaseRepository<T>(db, tableName, columns);
}