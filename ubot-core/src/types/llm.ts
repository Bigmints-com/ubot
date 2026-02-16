export interface LLMMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface LLMChatRequest {
  prompt: string;
  model: string;
  history?: LLMMessage[];
}

export interface LLMChatResponse {
  success: boolean;
  content?: string;
  error?: string;
}