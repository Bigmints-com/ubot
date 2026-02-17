export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMCompletionOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  stop?: string[];
}

export interface LLMCompletionResponse {
  id: string;
  content: string;
  model: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  finishReason: string;
}

export interface LLMClientConfig {
  apiKey: string;
  baseURL?: string;
  defaultModel?: string;
  defaultOptions?: LLMCompletionOptions;
}

export interface LLMClient {
  complete(messages: LLMMessage[], options?: LLMCompletionOptions): Promise<LLMCompletionResponse>;
  stream(messages: LLMMessage[], options?: LLMCompletionOptions): AsyncIterable<string>;
}