import type {
  ToolModule,
  ToolRegistry,
  ToolContext,
  ToolDefinition,
} from '../../../src/tools/types.js';

// ── Task Interface ──────────────────────────────────────

interface Task {
  description: string;
  is_completed: boolean;
}

// ── In-Memory Storage ──────────────────────────────────
// Note: In a real app, this should persist to data/local/todo-app.json
let tasks: Task[] = [];

// ── Tool Definitions ──────────────────────────────────

const TOOLS: ToolDefinition[] = [
  {
    name: 'todo_app_add_task',
    description: 'Adds a new task to the to-do list.',
    parameters: [
      { name: 'description', type: 'string', description: 'The task description', required: true },
    ],
  },
  {
    name: 'todo_app_view_tasks',
    description: 'Displays all current tasks in the list.',
    parameters: [],
  },
  {
    name: 'todo_app_mark_complete',
    description: 'Marks a task as complete and removes it from the list.',
    parameters: [
      { name: 'task_index', type: 'number', description: 'The 1-based index of the task to mark as complete', required: true },
    ],
  },
];

// ── Tool Executors ────────────────────────────────────

function registerExecutors(registry: ToolRegistry): void {
  const safe = (
    toolName: string,
    fn: (args: Record<string, unknown>) => Promise<string>,
  ) => {
    registry.register(toolName, async (args) => {
      try {
        const result = await fn(args);
        return { toolName, success: true, result, duration: 0 };
      } catch (err: any) {
        console.error(`[TodoApp] ${toolName} error:`, err.message);
        return { toolName, success: false, error: err.message, duration: 0 };
      }
    });
  };

  safe('todo_app_add_task', async (args) => {
    const description = String(args.description).trim();
    if (!description) {
      throw new Error('Task description cannot be empty.');
    }
    tasks.push({ description, is_completed: false });
    return `✅ Task added: '${description}'`;
  });

  safe('todo_app_view_tasks', async () => {
    if (tasks.length === 0) {
      return 'Your to-do list is empty!';
    }
    let output = '📋 TO-DO LIST:\n';
    tasks.forEach((task, index) => {
      const status = task.is_completed ? '[x]' : '[ ]';
      output += `${index + 1}. ${status} ${task.description}\n`;
    });
    return output;
  });

  safe('todo_app_mark_complete', async (args) => {
    const taskIndex = Number(args.task_index);
    const listIndex = taskIndex - 1;

    if (listIndex >= 0 && listIndex < tasks.length) {
      const completedTask = tasks.splice(listIndex, 1)[0];
      return `🎉 Success! Task '${completedTask.description}' marked as complete and removed.`;
    } else {
      throw new Error(`Invalid task number '${taskIndex}'.`);
    }
  });
}

// ── Module Export ──────────────────────────────────────

const todoAppModule: ToolModule = {
  name: 'todo-app',
  tools: TOOLS,
  register(registry: ToolRegistry, _ctx: ToolContext) {
    registerExecutors(registry);
  },

  ui: {
    title: 'To-Do App',
    icon: 'Sparkles',
    href: '/todo-app',
    group: 'Capabilities',
  },
};

export default todoAppModule;
