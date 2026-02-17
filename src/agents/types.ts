export type AgentStatus = 'idle' | 'running' | 'paused' | 'stopped' | 'error';
export type AgentPriority = 'critical' | 'high' | 'normal' | 'low';
export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface AgentConfig {
  maxConcurrentTasks: number;
  retryAttempts: number;
  timeout: number;
  priority: AgentPriority;
  tags: string[];
}

export interface AgentStats {
  tasksCompleted: number;
  tasksFailed: number;
  totalRuntime: number;
}

export interface AgentTask {
  id: string;
  name: string;
  status: TaskStatus;
  progress: number;
  priority: AgentPriority;
  createdAt: Date;
  updatedAt: Date;
  result?: unknown;
  error?: string;
}

export interface Agent {
  id: string;
  name: string;
  description?: string;
  status: AgentStatus;
  config: AgentConfig;
  stats: AgentStats;
  tasks: AgentTask[];
  createdAt: Date;
  updatedAt: Date;
}

export interface AgentFilter {
  status?: AgentStatus;
  priority?: AgentPriority;
  tags?: string[];
  search?: string;
}

export interface AgentListResult {
  agents: Agent[];
  total: number;
  page: number;
  pageSize: number;
}