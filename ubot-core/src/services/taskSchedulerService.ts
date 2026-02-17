import cron from 'node-cron';
import { Task } from '../types/task.js';

class TaskSchedulerService {
  private tasks: Task[] = [];
  private jobs: Map<string, cron.ScheduledTask> = new Map();

  addTask(task: Task): void {
    const existingIndex = this.tasks.findIndex((t) => t.id === task.id);
    if (existingIndex !== -1) {
      this.removeTask(task.id);
    }

    this.tasks.push(task);
    this.scheduleTask(task);
  }

  removeTask(id: string): void {
    const task = this.tasks.find((t) => t.id === id);
    if (task) {
      this.stopTask(id);
      this.tasks = this.tasks.filter((t) => t.id !== id);
    }
  }

  getTasks(): Task[] {
    return this.tasks;
  }

  toggleTask(id: string): void {
    const task = this.tasks.find((t) => t.id === id);
    if (task) {
      task.status = task.status === 'active' ? 'inactive' : 'active';
      if (task.status === 'active') {
        this.scheduleTask(task);
      } else {
        this.stopTask(id);
      }
    }
  }

  private scheduleTask(task: Task): void {
    if (task.status !== 'active') return;

    const job = cron.schedule(task.schedule, () => {
      console.log(`[Task Scheduler] Executing task: ${task.name}`);
      task.lastRun = new Date();
    });

    this.jobs.set(task.id, job);
  }

  private stopTask(id: string): void {
    const job = this.jobs.get(id);
    if (job) {
      job.stop();
      this.jobs.delete(id);
    }
  }
}

export default new TaskSchedulerService();