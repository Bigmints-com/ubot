export type SubagentStatus = 'pending' | 'running' | 'completed' | 'failed' | 'timed_out';

export interface SubagentConfig {
  name: string;
  systemPrompt?: string;
  allowedTools?: string[];
  deniedTools?: string[];
  maxIterations?: number; // default 15
  timeoutMs?: number; // default 120000
}

export interface SubagentResult {
  taskId: string;
  status: SubagentStatus;
  result?: string;
  error?: string;
  startedAt: Date;
  completedAt?: Date;
  toolCalls: number;
  iterations: number;
}
