import type { Agent, AgentTask, AgentFilter, AgentListResult, AgentConfig, AgentStats, AgentPriority } from './types';

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

export function createDefaultConfig(): AgentConfig {
  return {
    maxConcurrentTasks: 3,
    retryAttempts: 3,
    timeout: 30000,
    priority: 'normal',
    tags: [],
  };
}

export function createDefaultStats(): AgentStats {
  return {
    tasksCompleted: 0,
    tasksFailed: 0,
    totalRuntime: 0,
  };
}

export function filterAgents(agents: Agent[], filter: AgentFilter): Agent[] {
  return agents.filter((agent) => {
    if (filter.status && agent.status !== filter.status) {
      return false;
    }
    if (filter.priority && agent.config.priority !== filter.priority) {
      return false;
    }
    if (filter.tags && filter.tags.length > 0) {
      const hasAllTags = filter.tags.every((tag) =>
        agent.config.tags.includes(tag)
      );
      if (!hasAllTags) return false;
    }
    if (filter.search) {
      const searchLower = filter.search.toLowerCase();
      const nameMatch = agent.name.toLowerCase().includes(searchLower);
      const descMatch = agent.description?.toLowerCase().includes(searchLower);
      if (!nameMatch && !descMatch) return false;
    }
    return true;
  });
}

export function paginateAgents(
  agents: Agent[],
  page: number,
  pageSize: number
): AgentListResult {
  const total = agents.length;
  const start = (page - 1) * pageSize;
  const end = start + pageSize;
  return {
    agents: agents.slice(start, end),
    total,
    page,
    pageSize,
  };
}

export function sortTasksByPriority(tasks: AgentTask[]): AgentTask[] {
  const priorityOrder: Record<AgentPriority, number> = {
    critical: 0,
    high: 1,
    normal: 2,
    low: 3,
  };
  return [...tasks].sort(
    (a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]
  );
}

export function calculateAgentProgress(agent: Agent): number {
  if (agent.tasks.length === 0) return 0;
  const totalProgress = agent.tasks.reduce(
    (sum, task) => sum + task.progress,
    0
  );
  return Math.round(totalProgress / agent.tasks.length);
}

export function validateAgentName(name: string): boolean {
  return name.length >= 1 && name.length <= 100;
}

export function validateTaskName(name: string): boolean {
  return name.length >= 1 && name.length <= 200;
}