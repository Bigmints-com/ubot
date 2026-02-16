export type Provider = 'openai' | 'anthropic';

export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMRequest {
  provider: Provider;
  model: string;
  messages: Message[];
  apiKey?: string;
}

export interface LLMResponse {
  content: string;
  provider: Provider;
  model: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}