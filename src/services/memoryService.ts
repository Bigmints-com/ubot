import { db } from '../db.js';
import { logger } from '../services/logger.js';
import type { MemoryEntry } from '../types/memory.js';

export class MemoryService {
  static initialize(): void {
    const stmt = db.prepare(`
      CREATE TABLE IF NOT EXISTS memories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        type TEXT DEFAULT 'general',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    stmt.run();
    logger.info('Memory table initialized');
  }

  static save(entry: MemoryEntry): number {
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO memories (user_id, key, value, type)
      VALUES (?, ?, ?, ?)
    `);
    const result = stmt.run(entry.userId, entry.key, entry.value, entry.type || 'general');
    return result.lastInsertRowid as number;
  }

  static get(userId: string, key: string): MemoryEntry | null {
    const stmt = db.prepare('SELECT * FROM memories WHERE user_id = ? AND key = ?');
    const row = stmt.get(userId, key) as MemoryEntry | undefined;
    return row || null;
  }

  static getAll(userId: string): MemoryEntry[] {
    const stmt = db.prepare('SELECT * FROM memories WHERE user_id = ? ORDER BY created_at DESC');
    return stmt.all(userId) as MemoryEntry[];
  }

  static delete(userId: string, key: string): boolean {
    const stmt = db.prepare('DELETE FROM memories WHERE user_id = ? AND key = ?');
    const info = stmt.run(userId, key);
    return info.changes > 0;
  }
}