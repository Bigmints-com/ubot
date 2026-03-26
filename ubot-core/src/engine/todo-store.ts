/**
 * Todo Store
 *
 * In-memory storage for task progress tracking.
 */

import { log } from '../logger/ring-buffer.js';

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
export function getTodos(sessionId: string): TodoItem[] {
  return todoStorage.get(sessionId) || [];
}

/**
 * Create or update todos for a session.
 */
export function writeTodos(sessionId: string, todos: Array<{ id?: string; task: string; status: string }>): TodoItem[] {
  const existing = getTodos(sessionId);
  const now = new Date();

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
  log.info('Todos', `Session ${sessionId} updated with ${updated.length} tasks`);
  return updated;
}

/**
 * Clear todos for a session.
 */
export function clearTodos(sessionId: string): void {
  todoStorage.delete(sessionId);
  log.info('Todos', `Session ${sessionId} cleared`);
}
