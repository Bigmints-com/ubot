import cron from 'node-cron';
import Database from 'better-sqlite3';
import { join } from 'path';
import { homedir } from 'os';
import type {
  Task,
  TaskCreate,
  TaskUpdate,
  TaskFilter,
  TaskSortOptions,
  TaskListResult,
  TaskResult,
  TaskExecutionContext,
  SchedulerConfig,
  SchedulerStats,
  SchedulerEvent,
  SchedulerEventListener,
  TaskHandler,
  TaskSchedule,
} from './types.js';
import { DEFAULT_SCHEDULER_CONFIG } from './types.js';
import {
  generateTaskId,
  filterTasks,
  sortTasks,
  paginateTasks,
  validateTaskName,
  validateSchedule,
  calculateNextRun,
} from './utils.js';

/** Factory function that creates a handler from persisted task data */
export type HandlerFactory = (data: any, metadata: Record<string, unknown>) => TaskHandler;

/** Serializable row for SQLite persistence */
interface PersistedTask {
  id: string;
  name: string;
  description: string | null;
  schedule_json: string;
  data_json: string;
  priority: string;
  status: string;
  tags_json: string;
  metadata_json: string;
  created_at: string;
  updated_at: string;
  last_run_at: string | null;
  next_run_at: string | null;
  run_count: number;
  failure_count: number;
  enabled: number;
}

type LoggerInstance = {
  debug: (message: string, ...args: unknown[]) => void;
  info: (message: string, ...args: unknown[]) => void;
  warn: (message: string, ...args: unknown[]) => void;
  error: (message: string, ...args: unknown[]) => void;
};

type ScheduledJob = {
  taskId: string;
  job: ReturnType<typeof cron.schedule>;
};

export class TaskSchedulerService {
  private tasks: Map<string, Task> = new Map();
  private jobs: Map<string, ScheduledJob> = new Map();
  private runningTasks: Set<string> = new Set();
  private config: SchedulerConfig;
  private logger?: LoggerInstance;
  private listeners: SchedulerEventListener[] = [];
  private startTime: number = Date.now();
  private totalRunTime: number = 0;
  private totalRuns: number = 0;
  private isRunning: boolean = false;
  private db: Database.Database | null = null;
  private handlerFactories: Map<string, HandlerFactory> = new Map();

  constructor(config: Partial<SchedulerConfig> = {}) {
    this.config = { ...DEFAULT_SCHEDULER_CONFIG, ...config };
    this.logger = this.config.logger;
    this.initDB();
  }

  /** Register a handler factory for a task tag (e.g., 'scheduled_message', 'reminder', 'agent_task') */
  registerHandlerFactory(tag: string, factory: HandlerFactory): void {
    this.handlerFactories.set(tag, factory);
  }

  /** Initialize SQLite persistence */
  private initDB(): void {
    try {
      const ubotHome = process.env.UBOT_HOME || join(homedir(), '.ubot');
      const dbPath = join(ubotHome, 'data', 'ubot.db');
      this.db = new Database(dbPath);
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS scheduled_tasks (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          schedule_json TEXT NOT NULL,
          data_json TEXT NOT NULL DEFAULT '{}',
          priority TEXT NOT NULL DEFAULT 'normal',
          status TEXT NOT NULL DEFAULT 'pending',
          tags_json TEXT NOT NULL DEFAULT '[]',
          metadata_json TEXT NOT NULL DEFAULT '{}',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          last_run_at TEXT,
          next_run_at TEXT,
          run_count INTEGER NOT NULL DEFAULT 0,
          failure_count INTEGER NOT NULL DEFAULT 0,
          enabled INTEGER NOT NULL DEFAULT 1
        )
      `);
      this.logger?.info('[Scheduler] SQLite persistence initialized');
    } catch (err: any) {
      this.logger?.error(`[Scheduler] Failed to init DB: ${err.message}`);
      console.error(`[Scheduler] Failed to init DB: ${err.message}`);
    }
  }

  /** Persist a task to SQLite */
  private persistTask(task: Task): void {
    if (!this.db) return;
    try {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO scheduled_tasks
        (id, name, description, schedule_json, data_json, priority, status, tags_json, metadata_json,
         created_at, updated_at, last_run_at, next_run_at, run_count, failure_count, enabled)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      stmt.run(
        task.id,
        task.name,
        task.description || null,
        JSON.stringify(task.schedule),
        JSON.stringify(task.data),
        task.priority,
        task.status,
        JSON.stringify(task.tags),
        JSON.stringify(task.metadata),
        task.createdAt.toISOString(),
        task.updatedAt.toISOString(),
        task.lastRunAt?.toISOString() || null,
        task.nextRunAt?.toISOString() || null,
        task.runCount,
        task.failureCount,
        task.enabled ? 1 : 0,
      );
    } catch (err: any) {
      this.logger?.error(`[Scheduler] Failed to persist task ${task.id}: ${err.message}`);
    }
  }

  /** Remove a task from SQLite */
  private unpersistTask(id: string): void {
    if (!this.db) return;
    try {
      this.db.prepare('DELETE FROM scheduled_tasks WHERE id = ?').run(id);
    } catch (err: any) {
      this.logger?.error(`[Scheduler] Failed to delete persisted task ${id}: ${err.message}`);
    }
  }

  /** Load persisted tasks from SQLite and re-create them with handler factories */
  loadPersistedTasks(): number {
    if (!this.db) return 0;
    try {
      const rows = this.db.prepare(
        "SELECT * FROM scheduled_tasks WHERE enabled = 1 AND status IN ('pending', 'completed', 'paused')"
      ).all() as PersistedTask[];

      let loaded = 0;
      for (const row of rows) {
        if (this.tasks.has(row.id)) continue; // already loaded

        const tags: string[] = JSON.parse(row.tags_json);
        const data = JSON.parse(row.data_json);
        const metadata = JSON.parse(row.metadata_json);
        const rawSchedule: TaskSchedule = JSON.parse(row.schedule_json);
        const schedule: TaskSchedule = {
          ...rawSchedule,
          ...(rawSchedule.startDate ? { startDate: new Date(rawSchedule.startDate as any) } : {}),
          ...(rawSchedule.endDate ? { endDate: new Date(rawSchedule.endDate as any) } : {}),
        };

        // Find a handler factory based on tags
        let handler: TaskHandler | null = null;
        for (const tag of tags) {
          if (this.handlerFactories.has(tag)) {
            handler = this.handlerFactories.get(tag)!(data, metadata);
            break;
          }
        }

        if (!handler) {
          this.logger?.warn(`[Scheduler] No handler factory for task "${row.name}" (tags: ${tags.join(',')}), skipping`);
          continue;
        }

        // Recalculate nextRunAt for recurring tasks
        let nextRunAt = row.next_run_at ? new Date(row.next_run_at) : undefined;
        if (nextRunAt && nextRunAt.getTime() < Date.now() && schedule.recurrence !== 'once') {
          nextRunAt = calculateNextRun(schedule) ?? undefined;
        }
        // Skip one-time tasks that are already past
        if (schedule.recurrence === 'once' && nextRunAt && nextRunAt.getTime() < Date.now()) {
          continue;
        }

        const task: Task = {
          id: row.id,
          name: row.name,
          description: row.description || undefined,
          handler,
          schedule,
          data,
          priority: row.priority as any,
          status: 'pending',
          tags,
          metadata,
          createdAt: new Date(row.created_at),
          updatedAt: new Date(row.updated_at),
          lastRunAt: row.last_run_at ? new Date(row.last_run_at) : undefined,
          nextRunAt,
          runCount: row.run_count,
          failureCount: row.failure_count,
          enabled: true,
        };

        this.tasks.set(task.id, task);
        loaded++;
        this.logger?.info(`[Scheduler] Restored task: ${task.name} (${task.id}) → next: ${nextRunAt?.toLocaleString() || 'N/A'}`);
      }

      if (loaded > 0) {
        console.log(`[Scheduler] Restored ${loaded} persisted task(s) from database`);
      }
      return loaded;
    } catch (err: any) {
      this.logger?.error(`[Scheduler] Failed to load persisted tasks: ${err.message}`);
      console.error(`[Scheduler] Failed to load persisted tasks: ${err.message}`);
      return 0;
    }
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      this.logger?.warn('Scheduler is already running');
      return;
    }

    this.isRunning = true;
    this.startTime = Date.now();

    for (const task of this.tasks.values()) {
      if (task.enabled && task.status !== 'running') {
        await this.scheduleTask(task);
      }
    }

    this.emit({ type: 'scheduler_started', timestamp: new Date() });
    this.logger?.info('Task scheduler started');
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    for (const { job } of this.jobs.values()) {
      job.stop();
    }
    this.jobs.clear();

    this.isRunning = false;
    this.emit({ type: 'scheduler_stopped', timestamp: new Date() });
    this.logger?.info('Task scheduler stopped');
  }

  async createTask<T = unknown, R = unknown>(create: TaskCreate<T, R>): Promise<Task<T, R>> {
    if (!validateTaskName(create.name)) {
      throw new Error('Invalid task name. Must be 1-200 characters and contain only alphanumeric, underscore, hyphen, dot, or space characters.');
    }

    const scheduleValidation = validateSchedule(create.schedule);
    if (!scheduleValidation.valid) {
      throw new Error(`Invalid schedule: ${scheduleValidation.error}`);
    }

    const id = generateTaskId();
    const now = new Date();
    const nextRunAt = calculateNextRun(create.schedule);

    const task: Task<T, R> = {
      id,
      name: create.name,
      description: create.description,
      handler: create.handler,
      schedule: create.schedule,
      data: create.data ?? ({} as T),
      priority: create.priority ?? 'normal',
      status: 'pending',
      tags: create.tags ?? [],
      metadata: create.metadata ?? {},
      createdAt: now,
      updatedAt: now,
      runCount: 0,
      failureCount: 0,
      enabled: create.enabled ?? true,
      nextRunAt: nextRunAt ?? undefined,
    };

    this.tasks.set(id, task as Task);
    this.persistTask(task as Task);

    if (this.isRunning && task.enabled) {
      await this.scheduleTask(task as Task);
    }

    this.emit({ type: 'task_created', taskId: id, timestamp: new Date(), data: task });
    this.logger?.info(`Task created: ${task.name} (${id})`);

    return task;
  }

  async updateTask(id: string, update: TaskUpdate): Promise<Task> {
    const task = this.tasks.get(id);
    if (!task) {
      throw new Error(`Task not found: ${id}`);
    }

    if (update.name !== undefined && !validateTaskName(update.name)) {
      throw new Error('Invalid task name');
    }

    if (update.schedule !== undefined) {
      const scheduleValidation = validateSchedule(update.schedule);
      if (!scheduleValidation.valid) {
        throw new Error(`Invalid schedule: ${scheduleValidation.error}`);
      }
    }

    const nextRunAt = update.schedule ? calculateNextRun(update.schedule) : task.nextRunAt;

    const updatedTask: Task = {
      ...task,
      name: update.name ?? task.name,
      description: update.description ?? task.description,
      schedule: update.schedule ?? task.schedule,
      priority: update.priority ?? task.priority,
      tags: update.tags ?? task.tags,
      metadata: update.metadata ?? task.metadata,
      enabled: update.enabled ?? task.enabled,
      updatedAt: new Date(),
      nextRunAt: nextRunAt ?? undefined,
    };

    this.tasks.set(id, updatedTask);
    this.persistTask(updatedTask);

    if (this.jobs.has(id)) {
      const { job } = this.jobs.get(id)!;
      job.stop();
      this.jobs.delete(id);
    }

    if (this.isRunning && updatedTask.enabled) {
      await this.scheduleTask(updatedTask);
    }

    this.emit({ type: 'task_updated', taskId: id, timestamp: new Date(), data: updatedTask });
    this.logger?.info(`Task updated: ${updatedTask.name} (${id})`);

    return updatedTask;
  }

  async deleteTask(id: string): Promise<boolean> {
    const task = this.tasks.get(id);
    if (!task) {
      return false;
    }

    if (this.jobs.has(id)) {
      const { job } = this.jobs.get(id)!;
      job.stop();
      this.jobs.delete(id);
    }

    this.tasks.delete(id);
    this.unpersistTask(id);
    this.runningTasks.delete(id);

    this.emit({ type: 'task_deleted', taskId: id, timestamp: new Date() });
    this.logger?.info(`Task deleted: ${task.name} (${id})`);

    return true;
  }

  getTask(id: string): Task | undefined {
    return this.tasks.get(id);
  }

  listTasks(filter?: TaskFilter, sort?: TaskSortOptions, page: number = 1, pageSize: number = 20): TaskListResult {
    let tasks = Array.from(this.tasks.values());

    if (filter) {
      tasks = filterTasks(tasks, filter);
    }

    if (sort) {
      tasks = sortTasks(tasks, sort);
    }

    return paginateTasks(tasks, page, pageSize);
  }

  async runTaskNow(id: string): Promise<TaskResult> {
    const task = this.tasks.get(id);
    if (!task) {
      throw new Error(`Task not found: ${id}`);
    }

    return this.executeTask(task);
  }

  async cancelTask(id: string): Promise<boolean> {
    const task = this.tasks.get(id);
    if (!task) {
      return false;
    }

    if (this.jobs.has(id)) {
      const { job } = this.jobs.get(id)!;
      job.stop();
      this.jobs.delete(id);
    }

    const updatedTask: Task = {
      ...task,
      status: 'cancelled',
      enabled: false,
      updatedAt: new Date(),
    };

    this.tasks.set(id, updatedTask);
    this.persistTask(updatedTask);
    this.runningTasks.delete(id);

    this.emit({ type: 'task_cancelled', taskId: id, timestamp: new Date() });
    this.logger?.info(`Task cancelled: ${task.name} (${id})`);

    return true;
  }

  async pauseTask(id: string): Promise<boolean> {
    const task = this.tasks.get(id);
    if (!task) {
      return false;
    }

    if (this.jobs.has(id)) {
      const { job } = this.jobs.get(id)!;
      job.stop();
      this.jobs.delete(id);
    }

    const updatedTask: Task = {
      ...task,
      status: 'paused',
      updatedAt: new Date(),
    };

    this.tasks.set(id, updatedTask);

    this.logger?.info(`Task paused: ${task.name} (${id})`);
    return true;
  }

  async resumeTask(id: string): Promise<boolean> {
    const task = this.tasks.get(id);
    if (!task || task.status !== 'paused') {
      return false;
    }

    const updatedTask: Task = {
      ...task,
      status: 'pending',
      enabled: true,
      updatedAt: new Date(),
      nextRunAt: calculateNextRun(task.schedule) ?? undefined,
    };

    this.tasks.set(id, updatedTask);

    if (this.isRunning) {
      await this.scheduleTask(updatedTask);
    }

    this.logger?.info(`Task resumed: ${task.name} (${id})`);
    return true;
  }

  getStats(): SchedulerStats {
    const tasks = Array.from(this.tasks.values());

    return {
      totalTasks: tasks.length,
      enabledTasks: tasks.filter(t => t.enabled).length,
      runningTasks: this.runningTasks.size,
      pendingTasks: tasks.filter(t => t.status === 'pending').length,
      completedTasks: tasks.filter(t => t.status === 'completed').length,
      failedTasks: tasks.filter(t => t.status === 'failed').length,
      totalRuns: this.totalRuns,
      totalFailures: tasks.reduce((sum, t) => sum + t.failureCount, 0),
      averageRunTime: this.totalRuns > 0 ? this.totalRunTime / this.totalRuns : 0,
      uptime: Date.now() - this.startTime,
    };
  }

  addListener(listener: SchedulerEventListener): () => void {
    this.listeners.push(listener);
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  private async scheduleTask(task: Task): Promise<void> {
    if (!task.enabled || !task.nextRunAt) {
      return;
    }

    const scheduleJob = async (): Promise<void> => {
      await this.executeTask(task);

      const currentTask = this.tasks.get(task.id);
      if (currentTask && currentTask.enabled) {
        // 'once' tasks should NOT reschedule after execution
        if (currentTask.schedule.recurrence === 'once') {
          const completedTask = { ...currentTask, enabled: false, status: 'completed' as const };
          this.tasks.set(task.id, completedTask);
          this.jobs.delete(task.id);
          return;
        }

        const nextRun = calculateNextRun(currentTask.schedule);
        if (nextRun) {
          const updatedTask = { ...currentTask, nextRunAt: nextRun };
          this.tasks.set(task.id, updatedTask);
          const delay = nextRun.getTime() - Date.now();
          if (delay > 0) {
            const timeoutId = setTimeout(scheduleJob, delay);
            const fakeJob = {
              taskId: task.id,
              job: { stop: () => clearTimeout(timeoutId) },
            } as ScheduledJob;
            this.jobs.set(task.id, fakeJob);
          } else {
            await scheduleJob();
          }
        }
      }
    };

    if (task.schedule.recurrence === 'cron' && task.schedule.cronExpression) {
      if (!cron.validate(task.schedule.cronExpression)) {
        this.logger?.error(`Invalid cron expression for task ${task.name}: ${task.schedule.cronExpression}`);
        return;
      }

      const job = cron.schedule(
        task.schedule.cronExpression,
        async () => {
          await this.executeTask(task);
        },
        {
          timezone: task.schedule.timezone ?? this.config.timezone,
        }
      );

      this.jobs.set(task.id, { taskId: task.id, job });
    } else {
      const delay = task.nextRunAt.getTime() - Date.now();
      if (delay <= 0) {
        await scheduleJob();
      } else {
        const timeoutId = setTimeout(scheduleJob, delay);
        const fakeJob = {
          taskId: task.id,
          job: {
            stop: () => clearTimeout(timeoutId),
          },
        } as ScheduledJob;
        this.jobs.set(task.id, fakeJob);
      }
    }
  }

  private async executeTask<R>(task: Task): Promise<TaskResult<R>> {
    const startTime = Date.now();
    const context: TaskExecutionContext = {
      taskId: task.id,
      runNumber: task.runCount + 1,
      scheduledTime: task.nextRunAt ?? new Date(),
      actualTime: new Date(),
      previousResult: task.lastResult,
    };

    this.runningTasks.add(task.id);

    const runningTask: Task = {
      ...task,
      status: 'running',
      updatedAt: new Date(),
    };
    this.tasks.set(task.id, runningTask);

    this.emit({ type: 'task_started', taskId: task.id, timestamp: new Date(), data: context });
    this.logger?.debug(`Task started: ${task.name} (${task.id})`);

    try {
      const result = await Promise.race([
        task.handler(context, task.data),
        this.createTimeout<R>(this.config.defaultTimeout),
      ]) as R;

      const duration = Date.now() - startTime;
      const taskResult: TaskResult<R> = {
        success: true,
        data: result,
        duration,
        timestamp: new Date(),
      };

      const completedTask: Task = {
        ...this.tasks.get(task.id)!,
        status: 'completed',
        lastRunAt: new Date(),
        lastResult: taskResult as TaskResult,
        runCount: task.runCount + 1,
        updatedAt: new Date(),
        nextRunAt: calculateNextRun(task.schedule) ?? undefined,
      };

      this.tasks.set(task.id, completedTask);
      this.persistTask(completedTask);
      this.runningTasks.delete(task.id);

      this.totalRuns++;
      this.totalRunTime += duration;

      this.emit({ type: 'task_completed', taskId: task.id, timestamp: new Date(), data: taskResult });
      this.logger?.debug(`Task completed: ${task.name} (${task.id}) in ${duration}ms`);

      return taskResult;
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      const taskResult: TaskResult<R> = {
        success: false,
        error: errorMessage,
        duration,
        timestamp: new Date(),
      };

      const failedTask: Task = {
        ...this.tasks.get(task.id)!,
        status: 'failed',
        lastRunAt: new Date(),
        lastResult: taskResult as TaskResult,
        runCount: task.runCount + 1,
        failureCount: task.failureCount + 1,
        updatedAt: new Date(),
        nextRunAt: calculateNextRun(task.schedule) ?? undefined,
      };

      this.tasks.set(task.id, failedTask);
      this.persistTask(failedTask);
      this.runningTasks.delete(task.id);

      this.emit({ type: 'task_failed', taskId: task.id, timestamp: new Date(), data: taskResult });
      this.logger?.error(`Task failed: ${task.name} (${task.id}): ${errorMessage}`);

      return taskResult;
    }
  }

  private createTimeout<T>(ms: number): Promise<T> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Task timed out after ${ms}ms`)), ms);
    });
  }

  private emit(event: SchedulerEvent): void {
    for (const listener of this.listeners) {
      try {
        const result = listener(event);
        if (result instanceof Promise) {
          result.catch(err => this.logger?.error('Event listener error:', err));
        }
      } catch (err) {
        this.logger?.error('Event listener error:', err);
      }
    }
  }
}

let schedulerInstance: TaskSchedulerService | null = null;

export function createTaskScheduler(config?: Partial<SchedulerConfig>): TaskSchedulerService {
  return new TaskSchedulerService(config);
}

export function getTaskScheduler(): TaskSchedulerService {
  if (!schedulerInstance) {
    schedulerInstance = createTaskScheduler();
  }
  return schedulerInstance;
}

export function resetTaskScheduler(): void {
  if (schedulerInstance) {
    schedulerInstance.stop().catch(() => {});
    schedulerInstance = null;
  }
}