/**
 * Todo Store
 *
 * Persistence for task progress tracking.
 * Supports both SQLite and in-memory Map for tests.
 */

import { log } from '../logger/ring-buffer.js';
import type { DatabaseConnection, Migration } from '../data/database/types.js';

export interface TodoItem {
  id: string;
  task: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  createdAt: Date;
  updatedAt: Date;
}

/** Migration for todo tables */
export const todoMigrations: Migration[] = [
  {
    id: '006',
    name: 'create_todos',
    up: `
      CREATE TABLE IF NOT EXISTS todos (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        task TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_todos_session ON todos(session_id);
    `,
    down: `
      DROP TABLE IF EXISTS todos;
    `,
  },
];

const todoStorage = new Map<string, TodoItem[]>();

/**
 * Get todos for a session.
 */
export function getTodos(sessionId: string, db?: DatabaseConnection | null): TodoItem[] {
  if (db) {
    try {
      const rows = db.query<any>('SELECT * FROM todos WHERE session_id = ? ORDER BY created_at ASC', [sessionId]);
      return rows.map(row => ({
        id: row.id,
        task: row.task,
        status: row.status as TodoItem['status'],
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at),
      }));
    } catch (err: any) {
      log.error('Todos', `Failed to get todos from SQLite: ${err.message}`);
    }
  }
  return todoStorage.get(sessionId) || [];
}

/**
 * Create or update todos for a session.
 */
export function writeTodos(sessionId: string, todos: Array<{ id?: string; task: string; status: string }>, db?: DatabaseConnection | null): TodoItem[] {
  const now = new Date();
  const timestamp = now.toISOString();

  if (db) {
    try {
      return db.transaction(() => {
        const existing = getTodos(sessionId, db);
        const updatedItems = todos.map(input => {
          const existingItem = input.id ? existing.find(t => t.id === input.id) : null;
          const id = existingItem?.id || input.id || `todo-${Math.random().toString(36).slice(2, 9)}`;
          const status = (['pending', 'in_progress', 'completed', 'failed'].includes(input.status) 
            ? input.status 
            : 'pending') as TodoItem['status'];
          
          return {
            id,
            task: input.task,
            status,
            createdAt: existingItem?.createdAt || now,
            updatedAt: now
          };
        });

        // Current implementation: replace the whole set of todos for the session to match the provided list
        db.execute('DELETE FROM todos WHERE session_id = ?', [sessionId]);

        for (const item of updatedItems) {
          db.execute(
            'INSERT INTO todos (id, session_id, task, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
            [item.id, sessionId, item.task, item.status, item.createdAt.toISOString(), item.updatedAt.toISOString()]
          );
        }

        log.info('Todos', `Session ${sessionId} updated in SQLite with ${updatedItems.length} tasks`);
        return updatedItems;
      });
    } catch (err: any) {
      log.error('Todos', `Failed to write todos to SQLite: ${err.message}`);
    }
  }

  // Fallback to in-memory
  const existing = getTodos(sessionId);
  const updated = todos.map(input => {
    const existingItem = input.id ? existing.find(t => t.id === input.id) : null;
    
    const status = (['pending', 'in_progress', 'completed', 'failed'].includes(input.status) 
      ? input.status 
      : 'pending') as TodoItem['status'];

    if (existingItem) {
      existingItem.task = input.task;
      existingItem.status = status;
      existingItem.updatedAt = now;
      return existingItem;
    }

    const newItem: TodoItem = {
      id: input.id || `todo-${Math.random().toString(36).slice(2, 9)}`,
      task: input.task,
      status: status,
      createdAt: now,
      updatedAt: now,
    };
    return newItem;
  });

  todoStorage.set(sessionId, updated);
  log.info('Todos', `Session ${sessionId} updated in-memory with ${updated.length} tasks`);
  return updated;
}

/**
 * Clear todos for a session.
 */
export function clearTodos(sessionId: string, db?: DatabaseConnection | null): void {
  if (db) {
    try {
      db.execute('DELETE FROM todos WHERE session_id = ?', [sessionId]);
    } catch (err: any) {
      log.error('Todos', `Failed to clear todos in SQLite: ${err.message}`);
    }
  }
  todoStorage.delete(sessionId);
  log.info('Todos', `Session ${sessionId} cleared`);
}
