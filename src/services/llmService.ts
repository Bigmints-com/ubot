import openai from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { LLMRequest, LLMResponse } from '../types/llm.js';

export class LLMService {
  async generateResponse(request: LLMRequest): Promise<LLMResponse> {
    const apiKey = request.apiKey || process.env.LLM_API_KEY;
    if (!apiKey) {
      throw new Error('API key is required');
    }

    if (request.provider === 'openai') {
      const client = new openai.OpenAI({ apiKey });
      const completion = await client.chat.completions.create({
        model: request.model,
        messages: request.messages.map((m) => ({ role: m.role, content: m.content })),
      });
      return {
        content: completion.choices[0].message.content || '',
        provider: 'openai',
        model: request.model,
        usage: completion.usage,
      };
    } else if (request.provider === 'anthropic') {
      const client = new Anthropic({ apiKey });
      const message = await client.messages.create({
        model: request.model,
        max_tokens: 1024,
        messages: request.messages.map((m) => ({ role: m.role, content: m.content })),
      });
      return {
        content: message.content[0].text,
        provider: 'anthropic',
        model: request.model,
        usage: {
          promptTokens: message.usage.input_tokens,
          completionTokens: message.usage.output_tokens,
          totalTokens: message.usage.input_tokens + message.usage.output_tokens,
        },
      };
    } else {
      throw new Error(`Unsupported provider: ${request.provider}`);
    }
  }
}