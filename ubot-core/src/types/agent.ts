export interface Agent {
  id: string;
  name: string;
  status: 'active' | 'inactive' | 'error';
  createdAt: string;
}

export interface CreateAgentDto {
  name: string;
}