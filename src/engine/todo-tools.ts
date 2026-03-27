/**
 * Todo Tool Module
 *
 * Progress tracking for complex tasks.
 */

import type { ToolModule, ToolRegistry, ToolContext, ToolDefinition } from '../tools/types.js';
import { writeTodos } from './todo-store.js';

const TODO_TOOLS: ToolDefinition[] = [
  {
    name: 'write_todos',
    description: 'Create or update a task list for complex multi-step workflows. Only use for tasks with 3+ steps. Each todo has task (string description) and status (pending, in_progress, completed, or failed). Mark tasks as completed IMMEDIATELY after finishing each step. Keep exactly one task as in_progress at a time.',
    parameters: [
      {
        name: 'todos',
        type: 'array',
        description: 'Array of todo objects',
        required: true,
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Optional unique ID for the task (if updating existing)' },
            task: { type: 'string', description: 'Task description' },
            status: { type: 'string', description: 'Status: pending, in_progress, completed, or failed' },
          },
          required: ['task', 'status'],
        },
      },
    ],
  },
];

const todoToolModule: ToolModule = {
  name: 'todos',
  tools: TODO_TOOLS,
  register(registry: ToolRegistry, ctx: ToolContext) {
    registry.register('write_todos', async (args) => {
      const sessionId = ctx.sessionId || 'default';
      
      // Defensively extract todos — LLM may send as string, direct array, or nested
      let todos: Array<{ id?: string; task: string; status: string }> | undefined;
      
      if (Array.isArray(args.todos)) {
        todos = args.todos;
      } else if (typeof args.todos === 'string') {
        try { todos = JSON.parse(args.todos); } catch { /* ignore */ }
      } else if (Array.isArray(args)) {
        todos = args as any;
      }
      
      console.log(`[write_todos] args keys: ${Object.keys(args).join(',')}, todos type: ${typeof args.todos}, isArray: ${Array.isArray(todos)}`);
      
      if (!Array.isArray(todos) || todos.length === 0) {
        return {
          toolName: 'write_todos',
          success: false,
          error: `Missing or invalid "todos" parameter. Received keys: ${Object.keys(args).join(',')}. Pass an array of {task, status} objects.`,
          duration: 0,
        };
      }

      const start = Date.now();
      try {
        const db = ctx.getDatabase();
        const result = writeTodos(sessionId, todos, db);
        return {
          toolName: 'write_todos',
          success: true,
          result: JSON.stringify({ message: 'Todos updated successfully', count: result.length, todos: result }),
          duration: Date.now() - start,
        };
      } catch (err: any) {
        return {
          toolName: 'write_todos',
          success: false,
          error: `Failed to write todos: ${err.message}`,
          duration: Date.now() - start,
        };
      }
    });
  },
};

export default todoToolModule;
