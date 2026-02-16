import { Agent, CreateAgentDto } from '../types/agent.js';

// In-memory state
let agents: Agent[] = [];

export const agentService = {
  getAll: (): Agent[] => {
    return agents;
  },

  getById: (id: string): Agent | undefined => {
    return agents.find((agent) => agent.id === id);
  },

  create: (dto: CreateAgentDto): Agent => {
    const newAgent: Agent = {
      id: crypto.randomUUID(),
      name: dto.name,
      status: 'active',
      createdAt: new Date().toISOString(),
    };
    agents.push(newAgent);
    return newAgent;
  },

  delete: (id: string): boolean => {
    const index = agents.findIndex((agent) => agent.id === id);
    if (index === -1) return false;
    agents.splice(index, 1);
    return true;
  },
};