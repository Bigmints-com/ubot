import OpenAI from 'openai';
import type { LLMClient, LLMClientConfig, LLMMessage, LLMCompletionOptions, LLMCompletionResponse } from '../types.js';

const DEFAULT_MODEL = 'gpt-4o-mini';

export class OpenAIClient implements LLMClient {
  private client: OpenAI;
  private defaultModel: string;
  private defaultOptions: LLMCompletionOptions;

  constructor(config: LLMClientConfig) {
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
    });
    this.defaultModel = config.defaultModel || DEFAULT_MODEL;
    this.defaultOptions = config.defaultOptions || {};
  }

  async complete(messages: LLMMessage[], options?: LLMCompletionOptions): Promise<LLMCompletionResponse> {
    const mergedOptions = { ...this.defaultOptions, ...options };
    const model = mergedOptions.model || this.defaultModel;

    const response = await this.client.chat.completions.create({
      model,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      temperature: mergedOptions.temperature,
      max_tokens: mergedOptions.maxTokens,
      top_p: mergedOptions.topP,
      stop: mergedOptions.stop,
    });

    const choice = response.choices[0];
    if (!choice || !choice.message) {
      throw new Error('No completion returned from LLM');
    }

    return {
      id: response.id,
      content: choice.message.content || '',
      model: response.model,
      usage: {
        promptTokens: response.usage?.prompt_tokens || 0,
        completionTokens: response.usage?.completion_tokens || 0,
        totalTokens: response.usage?.total_tokens || 0,
      },
      finishReason: choice.finish_reason || 'unknown',
    };
  }

  async *stream(messages: LLMMessage[], options?: LLMCompletionOptions): AsyncIterable<string> {
    const mergedOptions = { ...this.defaultOptions, ...options };
    const model = mergedOptions.model || this.defaultModel;

    const stream = await this.client.chat.completions.create({
      model,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      temperature: mergedOptions.temperature,
      max_tokens: mergedOptions.maxTokens,
      top_p: mergedOptions.topP,
      stop: mergedOptions.stop,
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        yield content;
      }
    }
  }
}

export function createLLMClient(config: LLMClientConfig): LLMClient {
  return new OpenAIClient(config);
}