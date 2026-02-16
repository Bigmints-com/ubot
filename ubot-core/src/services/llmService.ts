import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { db } from '../db.js';

class LLMService {
  private openai: OpenAI | null = null;
  private anthropic: Anthropic | null = null;

  private getApiKey(model: string): string {
    const key = db.prepare('SELECT api_key FROM agents WHERE model = ?').get(model);
    if (!key || !key.api_key) {
      throw new Error(`API key not found for model: ${model}`);
    }
    return key.api_key;
  }

  private initOpenAI() {
    if (!this.openai) {
      this.openai = new OpenAI();
    }
  }

  private initAnthropic() {
    if (!this.anthropic) {
      this.anthropic = new Anthropic();
    }
  }

  async chat(request: LLMChatRequest): Promise<LLMChatResponse> {
    try {
      const { prompt, model, history = [] } = request;

      if (model.startsWith('gpt') || model.startsWith('o1')) {
        this.initOpenAI();
        const apiKey = this.getApiKey(model);
        this.openai = new OpenAI({ apiKey });

        const completion = await this.openai.chat.completions.create({
          model: model,
          messages: [
            { role: 'system', content: 'You are a helpful assistant.' },
            ...history,
            { role: 'user', content: prompt }
          ],
        });

        return {
          success: true,
          content: completion.choices[0].message.content
        };
      } else if (model.startsWith('claude')) {
        this.initAnthropic();
        const apiKey = this.getApiKey(model);
        this.anthropic = new Anthropic({ apiKey });

        const message = await this.anthropic.messages.create({
          model: model,
          max_tokens: 1024,
          messages: [
            { role: 'user', content: prompt }
          ]
        });

        return {
          success: true,
          content: message.content[0].type === 'text' ? message.content[0].text : ''
        };
      } else {
        throw new Error(`Unsupported model: ${model}`);
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}

export default new LLMService();