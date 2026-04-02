/**
 * Todo Store
 *
 * Persistence for task progress tracking.
 * Supports both SQLite and in-memory Map for tests.
 */

import { log } from '../logger/ring-buffer.js';
import type { DatabaseConnection } from '../data/database/types.js';

export interface TodoItem {
  id: string;
  task: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  createdAt: Date;
  updatedAt: Date;
}



const todoStorage = new Map<string, TodoItem[]>();

/**
 * Get todos for a session.
 */
export async function getTodos(sessionId: string, db?: DatabaseConnection | null): Promise<TodoItem[]> {
  if (db) {
    try {
      const client = db.get_client();
      const { data, error } = await client
        .from('ubot_todos')
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true });
        
      if (!error && data) {
        return data.map((row: any) => ({
          id: row.id,
          task: row.task,
          status: row.status as TodoItem['status'],
          createdAt: new Date(row.created_at),
          updatedAt: new Date(row.updated_at),
        }));
      }
    } catch (err: any) {
      log.error('Todos', `Failed to get todos from Supabase: ${err.message}`);
    }
  }
  return todoStorage.get(sessionId) || [];
}

/**
 * Create or update todos for a session.
 */
export async function writeTodos(sessionId: string, todos: Array<{ id?: string; task: string; status: string }>, db?: DatabaseConnection | null): Promise<TodoItem[]> {
  const now = new Date();
  const timestamp = now.toISOString();

  if (db) {
    try {
      const client = db.get_client();
      const existing = await getTodos(sessionId, db);
      const updatedItems = todos.map(input => {
        const existingItem = input.id ? existing.find(t => t.id === input.id) : null;
        const id = existingItem?.id || input.id || `todo-${Math.random().toString(36).slice(2, 9)}`;
        const status = (['pending', 'in_progress', 'completed', 'failed'].includes(input.status) 
          ? input.status 
          : 'pending') as TodoItem['status'];
        
        return {
          id,
          session_id: sessionId,
          task: input.task,
          status,
          created_at: (existingItem?.createdAt || now).toISOString(),
          updated_at: timestamp
        };
      });

      // Clear existing and replace
      await client.from('ubot_todos').delete().eq('session_id', sessionId);
      
      if (updatedItems.length > 0) {
        await client.from('ubot_todos').insert(updatedItems);
      }

      log.info('Todos', `Session ${sessionId} updated in Supabase with ${updatedItems.length} tasks`);
      return updatedItems.map(item => ({
        id: item.id,
        task: item.task,
        status: item.status as TodoItem['status'],
        createdAt: new Date(item.created_at),
        updatedAt: new Date(item.updated_at)
      }));
    } catch (err: any) {
      log.error('Todos', `Failed to write todos to Supabase: ${err.message}`);
    }
  }

  // Fallback to in-memory
  const existing = await getTodos(sessionId);
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
export async function clearTodos(sessionId: string, db?: DatabaseConnection | null): Promise<void> {
  if (db) {
    try {
      await db.get_client().from('ubot_todos').delete().eq('session_id', sessionId);
    } catch (err: any) {
      log.error('Todos', `Failed to clear todos in Supabase: ${err.message}`);
    }
  }
  todoStorage.delete(sessionId);
  log.info('Todos', `Session ${sessionId} cleared`);
}
