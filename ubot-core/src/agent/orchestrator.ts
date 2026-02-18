/**
 * Agent Orchestrator
 * The core agent loop: message → LLM → tool execution → response
 * 
 * Uses native OpenAI-compatible tool calling (works with Ollama, Gemini, OpenAI, etc.)
 */

import OpenAI from 'openai';
import type { 
  AgentConfig, AgentResponse, ChatMessage, ChatMessageMetadata,
  ToolExecutionResult, DEFAULT_AGENT_CONFIG 
} from './types.js';
import type { ConversationStore } from './conversation.js';
import type { MemoryStore } from './memory-store.js';
import { type Soul, SOUL_REWRITE_PROMPT, OWNER_SOUL_ID } from './soul.js';
import { AGENT_TOOLS, formatToolsForAPI, createToolRegistry, getToolsForSource, type ToolRegistry } from './tools.js';

export interface AgentOrchestrator {
  /** Process a message and return the agent's response */
  chat(sessionId: string, message: string, source?: 'web' | 'whatsapp' | 'telegram', contactName?: string, isOwner?: boolean): Promise<AgentResponse>;
  /** Direct LLM text generation (no tools) — for skill generation, etc. */
  generate(systemPrompt: string, userMessage: string): Promise<string>;
  /** Get the current config */
  getConfig(): AgentConfig;
  /** Update config */
  updateConfig(updates: Partial<AgentConfig>): AgentConfig;
  /** Get the tool registry for registering tool executors */
  getToolRegistry(): ToolRegistry;
  /** Get the conversation store */
  getConversationStore(): ConversationStore;
  /** Get the memory store */
  getMemoryStore(): MemoryStore;
  /** Get the soul */
  getSoul(): Soul;
}

export function createAgentOrchestrator(
  config: AgentConfig,
  conversationStore: ConversationStore,
  memoryStore: MemoryStore,
  soul: Soul,
): AgentOrchestrator {
  let currentConfig = { ...config };
  const toolRegistry = createToolRegistry();

  function createLLMClient(): OpenAI {
    return new OpenAI({
      apiKey: currentConfig.llmApiKey,
      baseURL: currentConfig.llmBaseUrl,
    });
  }

  function buildSystemPrompt(): string {
    // Simple system prompt — tools are passed natively via the API
    return currentConfig.systemPrompt.replace('{{tools}}', 'Tools are provided natively via the API. Use function calls to execute them.');
  }

  type ChatMsg = OpenAI.Chat.Completions.ChatCompletionMessageParam;

  function buildMessages(sessionId: string, userMessage: string, isOwner: boolean = false): ChatMsg[] {
    const history = conversationStore.getHistory(sessionId, currentConfig.maxHistoryMessages);
    
    // Build system prompt with soul data (bot persona + owner + contact)
    let systemPrompt = buildSystemPrompt();
    const soulPrompt = soul.buildSoulPrompt(sessionId, isOwner);
    if (soulPrompt) {
      systemPrompt += '\n\n' + soulPrompt;
    }

    const messages: ChatMsg[] = [
      { role: 'system', content: systemPrompt },
    ];

    // Add conversation history (skip system messages, only user/assistant)
    for (const msg of history) {
      if (msg.role === 'user' || msg.role === 'assistant') {
        messages.push({ role: msg.role, content: msg.content });
      }
    }

    // Add the new user message
    messages.push({ role: 'user', content: userMessage });

    return messages;
  }

  /** Extract/update soul document from a conversation turn */
  async function extractSoulData(sessionId: string, userMessage: string, assistantResponse: string, source?: 'web' | 'whatsapp' | 'telegram', contactName?: string, isOwner: boolean = false): Promise<void> {
    if (!userMessage || !assistantResponse) return;
    // Read owner name from the owner persona document
    const ownerDoc = soul.getDocument(OWNER_SOUL_ID);
    const ownerNameMatch = ownerDoc?.match(/name:\s*(.+)/i);
    const ownerName = ownerNameMatch ? ownerNameMatch[1].trim() : '';

    // Owner → update owner document; visitor → update contact document
    const personaId = isOwner ? OWNER_SOUL_ID : sessionId;

    const conversationText = `User: ${userMessage}\nAssistant: ${assistantResponse}`;
    const currentDoc = soul.getDocument(personaId);

    // Add owner context to the prompt so the LLM knows who the owner is
    const ownerContext = ownerName
      ? `\nCONTEXT: The owner of this AI assistant is "${ownerName}". The user in this conversation is "${contactName || ownerName || 'unknown'}". Only record facts about the USER in the conversation.`
      : '';

    try {
      const client = createLLMClient();
      const prompt = currentDoc
        ? `CURRENT DOCUMENT:\n${currentDoc}\n${ownerContext}\n\nNEW CONVERSATION:\n${conversationText}`
        : `CURRENT DOCUMENT:\n(empty - this is a new person)\n${ownerContext}\n\nNEW CONVERSATION:\n${conversationText}`;

      const completion = await client.chat.completions.create({
        model: currentConfig.llmModel,
        messages: [
          { role: 'system', content: SOUL_REWRITE_PROMPT },
          { role: 'user', content: prompt },
        ],
        temperature: 0.1,
        max_tokens: 2000,
      });

      const updatedDoc = completion.choices[0]?.message?.content || '';
      if (updatedDoc.trim()) {
        soul.saveDocument(personaId, updatedDoc.trim());
        console.log(`[Soul] Updated document for ${personaId} (${updatedDoc.length} chars)`);
      }
    } catch (err: any) {
      console.error('[Soul] Document rewrite error:', err.message);
    }
  }

  async function callLLM(
    messages: ChatMsg[],
    isOwner: boolean = true,
  ): Promise<{
    content: string;
    toolCalls: Array<{ id: string; toolName: string; arguments: Record<string, unknown> }>;
    usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
  }> {
    const client = createLLMClient();
    const filteredTools = getToolsForSource(isOwner);
    const tools = formatToolsForAPI(filteredTools);
    console.log(`[Agent] Tools available: ${filteredTools.length} (isOwner: ${isOwner})`);
    
    try {
      const completion = await client.chat.completions.create({
        model: currentConfig.llmModel,
        messages,
        temperature: currentConfig.temperature,
        max_tokens: currentConfig.maxTokens,
        tools,
      });

      const choice = completion.choices?.[0];
      if (!choice) {
        console.error('[Agent] No choices in LLM response:', JSON.stringify(completion).slice(0, 500));
        return { content: '', toolCalls: [], usage: undefined };
      }
      const content = choice.message?.content || '';
      const nativeToolCalls = choice.message?.tool_calls || [];
      
      const toolCalls = nativeToolCalls
        .filter((tc: any) => tc.type === 'function' && tc.function)
        .map((tc: any) => {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(tc.function.arguments || '{}');
        } catch {
          // Invalid JSON — pass empty args
        }
        return {
          id: tc.id,
          toolName: tc.function.name,
          arguments: args,
        };
      });

      const usage = completion.usage ? {
        promptTokens: completion.usage.prompt_tokens,
        completionTokens: completion.usage.completion_tokens,
        totalTokens: completion.usage.total_tokens,
      } : undefined;

      console.log(`[Agent] LLM response: ${content.length} chars text, ${toolCalls.length} tool calls`);
      if (toolCalls.length > 0) {
        console.log(`[Agent] Tool calls:`, toolCalls.map(tc => `${tc.toolName}(${JSON.stringify(tc.arguments)})`).join(', '));
      }

      return { content, toolCalls, usage };
    } catch (err: any) {
      console.error('[Agent] LLM call failed:', err.message);
      throw new Error(`LLM call failed: ${err.message}`);
    }
  }

  return {
    async chat(
      sessionId: string,
      message: string,
      source: 'web' | 'whatsapp' | 'telegram' = 'web',
      contactName?: string,
      isOwner?: boolean,
    ): Promise<AgentResponse> {
      const startTime = Date.now();
      const toolResults: ToolExecutionResult[] = [];

      // Ensure session exists
      conversationStore.getOrCreateSession(
        sessionId,
        source,
        source === 'web' ? 'Command Center' : contactName || sessionId
      );

      // Store the user message
      const userMetadata: ChatMessageMetadata = {
        source,
        whatsappJid: source === 'whatsapp' ? sessionId : undefined,
        contactName,
      };
      conversationStore.addMessage(sessionId, 'user', message, userMetadata);

      // isOwner is now passed in by the unified message handler.
      // Fallback: if not explicitly provided, assume web === owner (backward compat)
      const ownerFlag = isOwner ?? (source === 'web');

      // Build the messages array with history (pass isOwner for soul prompt framing)
      let messages = buildMessages(sessionId, message, ownerFlag);
      let lastUsage: { promptTokens: number; completionTokens: number; totalTokens: number } | undefined;

      // Agent loop with tool calling
      let iteration = 0;
      let finalContent = '';

      while (iteration < currentConfig.maxToolIterations) {
        iteration++;

        const llmResult = await callLLM(messages, ownerFlag);
        lastUsage = llmResult.usage;

        if (llmResult.toolCalls.length === 0) {
          // No tool calls — this is the final response
          finalContent = llmResult.content;
          break;
        }

        // Add assistant message with tool_calls to context
        messages.push({
          role: 'assistant',
          content: llmResult.content || null,
          tool_calls: llmResult.toolCalls.map(tc => ({
            id: tc.id,
            type: 'function' as const,
            function: {
              name: tc.toolName,
              arguments: JSON.stringify(tc.arguments),
            },
          })),
        } as ChatMsg);

        // Execute tool calls and add results
        for (const toolCall of llmResult.toolCalls) {
          console.log(`[Agent] Executing: ${toolCall.toolName}(${JSON.stringify(toolCall.arguments)})`);
          const result = await toolRegistry.execute({
            toolName: toolCall.toolName,
            arguments: toolCall.arguments,
            rawText: '',
          });
          toolResults.push(result);

          // Add tool result as a "tool" role message (OpenAI format)
          const toolResultContent = result.success 
            ? (result.result || 'Success') 
            : `Error: ${result.error}`;
          console.log(`[Agent] Tool result for ${toolCall.toolName}: ${toolResultContent.slice(0, 200)}`);
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: toolResultContent,
          } as ChatMsg);
        }

        // If this was the last iteration, use whatever text we have
        if (iteration >= currentConfig.maxToolIterations) {
          finalContent = llmResult.content || 'I completed the requested actions.';
        }
      }

      // Store the assistant response
      const assistantMetadata: ChatMessageMetadata = {
        source: 'web',
        toolCall: toolResults.length > 0 ? {
          toolName: toolResults.map(r => r.toolName).join(', '),
          arguments: {},
        } : undefined,
        usage: lastUsage,
        model: currentConfig.llmModel,
      };
      conversationStore.addMessage(sessionId, 'assistant', finalContent, assistantMetadata);

      // Extract soul data in the background (don't block the response)
      extractSoulData(sessionId, message, finalContent, source, contactName, ownerFlag).catch(err => {
        console.error('[Soul] Background extraction failed:', err.message);
      });

      return {
        content: finalContent,
        toolCalls: toolResults,
        usage: lastUsage,
        model: currentConfig.llmModel,
        duration: Date.now() - startTime,
      };
    },

    async generate(systemPrompt: string, userMessage: string): Promise<string> {
      const client = createLLMClient();
      try {
        const completion = await client.chat.completions.create({
          model: currentConfig.llmModel,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
          ],
          temperature: currentConfig.temperature,
          max_tokens: currentConfig.maxTokens,
          // No tools — pure text generation
        });
        return completion.choices[0]?.message?.content || '';
      } catch (err: any) {
        console.error('[Agent] Generate call failed:', err.message);
        throw new Error(`LLM generate failed: ${err.message}`);
      }
    },

    getConfig(): AgentConfig {
      return { ...currentConfig };
    },

    updateConfig(updates: Partial<AgentConfig>): AgentConfig {
      currentConfig = { ...currentConfig, ...updates };
      return { ...currentConfig };
    },

    getToolRegistry(): ToolRegistry {
      return toolRegistry;
    },

    getConversationStore(): ConversationStore {
      return conversationStore;
    },

    getMemoryStore(): MemoryStore {
      return memoryStore;
    },

    getSoul(): Soul {
      return soul;
    },
  };
}
